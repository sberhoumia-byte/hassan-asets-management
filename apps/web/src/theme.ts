import { createTheme, type MantineColorsTuple } from "@mantine/core";

// الأزرق المؤسساتي: 9 = الأزرق الداكن #0B2545، 6 = الأزرق المتوسط #1D5FA8
const brand: MantineColorsTuple = [
  "#eaf1fa",
  "#d3e2f4",
  "#a6c3e8",
  "#76a3dc",
  "#4d87d1",
  "#3374c4",
  "#1d5fa8",
  "#174d8a",
  "#113a6a",
  "#0b2545",
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: 6,
  colors: { brand },
  fontFamily: '"Noto Sans Arabic", "Tajawal", system-ui, sans-serif',
  headings: { fontFamily: '"Cairo", "Tajawal", sans-serif', fontWeight: "700" },
  defaultRadius: "md",
  components: {
    Button: { defaultProps: { radius: "md" }, styles: { root: { fontFamily: "Tajawal, sans-serif", fontWeight: 700 } } },
    NavLink: { styles: { label: { fontFamily: "Tajawal, sans-serif", fontSize: 14 } } },
    Card: { defaultProps: { withBorder: true, radius: "lg", padding: "lg" } },
    Select: { defaultProps: { searchable: true, nothingFoundMessage: "—", checkIconPosition: "left" } },
  },
});
