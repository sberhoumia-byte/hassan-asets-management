package ma.hassanibnthabit.assets;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * تطبيق Android واجهة رقيقة لخادم المؤسسة (قرار النشر: خادم مركزي).
 * - يحفظ عنوان الخادم فقط (SharedPreferences)، ولا يخزن بيانات المؤسسة.
 * - التنقل داخل التطبيق مقصور على صفحة الاتصال المحلية وأصل الخادم المحفوظ؛ غير ذلك يفتح في المتصفح.
 * - جسر HassanAndroid: فحص الخادم والانتقال إليه (من صفحة الاتصال فقط)، وحفظ الملفات والطباعة (من صفحات الخادم فقط).
 */
@CapacitorPlugin(name = "HassanShell")
public class HassanShellPlugin extends Plugin {

    private static final String PREFS = "hassan_shell";
    private static final String KEY_SERVER = "server";
    private volatile String currentUrl = "";

    @Override
    public void load() {
        WebView wv = getBridge().getWebView();
        wv.addJavascriptInterface(new JsBridge(), "HassanAndroid");
        getBridge().addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageStarted(WebView webView) {
                    currentUrl = String.valueOf(webView.getUrl());
                }

                @Override
                public void onPageLoaded(WebView webView) {
                    currentUrl = String.valueOf(webView.getUrl());
                }
            }
        );
    }

    /** null = سلوك Capacitor الافتراضي (الصفحة المحلية تُحمّل، والباقي يفتح في المتصفح)، false = يُحمّل داخل التطبيق. */
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String server = savedServer();
        if (server != null && server.equals(origin(url.toString()))) return false;
        return null;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String savedServer() {
        return prefs().getString(KEY_SERVER, null);
    }

    /** أصل http(s) (بروتوكول://مضيف[:منفذ]) أو null. */
    static String origin(String raw) {
        try {
            Uri u = Uri.parse(raw);
            String scheme = u.getScheme();
            if (scheme == null || !(scheme.equals("http") || scheme.equals("https"))) return null;
            if (u.getHost() == null || u.getHost().isEmpty() || u.getUserInfo() != null) return null;
            int port = u.getPort();
            boolean defaultPort = port == -1 || (scheme.equals("http") && port == 80) || (scheme.equals("https") && port == 443);
            return scheme + "://" + u.getHost().toLowerCase(java.util.Locale.ROOT) + (defaultPort ? "" : ":" + port);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * عنوان الصفحة المعروضة فعلاً. دوال الجسر تعمل خارج خيط الواجهة، وWebView.getUrl() لا تُقرأ إلا منه،
     * لذا نقرؤها عبر runOnUiThread، ونرجع إلى آخر عنوان سجّله المستمع إن تعذّر ذلك.
     */
    private String pageUrl() {
        final String[] u = { null };
        final CountDownLatch done = new CountDownLatch(1);
        getActivity().runOnUiThread(() -> {
            try {
                u[0] = getBridge().getWebView().getUrl();
            } finally {
                done.countDown();
            }
        });
        try {
            done.await(2, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return u[0] != null ? u[0] : currentUrl;
    }

    private boolean onConnectPage() {
        String local = getBridge().getLocalUrl();
        String u = pageUrl();
        return u.equals(local) || u.startsWith(local + "/") || u.startsWith(local + "?");
    }

    private boolean onServerPage() {
        String s = savedServer();
        return s != null && s.equals(origin(pageUrl()));
    }

    private void toast(String msg) {
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), msg, Toast.LENGTH_LONG).show());
    }

    private class JsBridge {

        @JavascriptInterface
        public String version() {
            try {
                return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "?";
            }
        }

        @JavascriptInterface
        public String getServer() {
            return onConnectPage() ? savedServer() : null;
        }

        /** يجيب {"ok":true} إذا أجاب /api/v1/health بـ {"status":"ok"}. */
        @JavascriptInterface
        public String check(String url) {
            String o = origin(url);
            if (o == null) return "{\"ok\":false,\"error\":\"invalid\"}";
            if (!onConnectPage()) return "{\"ok\":false,\"error\":\"page\"}";
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(o + "/api/v1/health").openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setInstanceFollowRedirects(false);
                c.setUseCaches(false);
                if (c.getResponseCode() != 200) return "{\"ok\":false,\"error\":\"not_hassan\"}";
                byte[] buf = new byte[4096];
                int n;
                StringBuilder sb = new StringBuilder();
                try (InputStream in = c.getInputStream()) {
                    while ((n = in.read(buf)) > 0 && sb.length() < 4096) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                }
                String status = new JSONObject(sb.toString()).optString("status");
                return "ok".equals(status) ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"not_hassan\"}";
            } catch (SocketTimeoutException e) {
                return "{\"ok\":false,\"error\":\"timeout\"}";
            } catch (org.json.JSONException e) {
                return "{\"ok\":false,\"error\":\"not_hassan\"}";
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"unreachable\"}";
            } finally {
                if (c != null) c.disconnect();
            }
        }

        @JavascriptInterface
        public void open(String url) {
            String o = origin(url);
            if (!onConnectPage() || o == null) return;
            prefs().edit().putString(KEY_SERVER, o).apply();
            getActivity().runOnUiThread(() -> getBridge().getWebView().loadUrl(o + "/"));
        }

        /** حفظ ملف (تقرير PDF/Excel...) في مجلد التنزيلات ثم فتحه. */
        @JavascriptInterface
        public boolean saveFile(String name, String mime, String base64) {
            if (!onServerPage()) return false;
            String safe = name == null ? "file" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
            if (safe.isEmpty()) safe = "file";
            String type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                Uri uri;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    v.put(MediaStore.Downloads.MIME_TYPE, type);
                    uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new IllegalStateException("insert failed");
                    try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                        out.write(data);
                    }
                } else {
                    File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File f = new File(dir, safe);
                    try (FileOutputStream out = new FileOutputStream(f)) {
                        out.write(data);
                    }
                    uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
                }
                toast("حُفظ الملف في التنزيلات: " + safe);
                Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    getContext().startActivity(Intent.createChooser(view, safe).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) {
                    // لا تطبيق لفتح هذا النوع: الملف محفوظ في التنزيلات
                }
                return true;
            } catch (Exception e) {
                toast("تعذّر حفظ الملف");
                return false;
            }
        }

        /** طباعة الصفحة الحالية (الوصولات والمحاضر) عبر خدمة الطباعة في Android، ومنها الحفظ PDF. */
        @JavascriptInterface
        public void print(String title) {
            if (!onServerPage()) return;
            String job = title == null || title.isEmpty() ? "التدبير المادي" : title;
            getActivity().runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = getBridge().getWebView().createPrintDocumentAdapter(job);
                pm.print(job, adapter, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }
    }
}
