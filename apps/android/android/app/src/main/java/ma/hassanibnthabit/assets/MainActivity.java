package ma.hassanibnthabit.assets;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // يجب تسجيل الإضافة قبل إنشاء الجسر ليُضاف HassanAndroid قبل تحميل صفحة الاتصال
        registerPlugin(HassanShellPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
