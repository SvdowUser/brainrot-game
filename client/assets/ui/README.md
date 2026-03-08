 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/client/assets/ui/README.md b/client/assets/ui/README.md
new file mode 100644
index 0000000000000000000000000000000000000000..84f6d6cbe206516adc9bb11072060613f6f594c7
--- /dev/null
+++ b/client/assets/ui/README.md
@@ -0,0 +1,8 @@
+# UI PNG placeholders
+
+You can replace these files with your own PNG icons:
+
+- `coin.png` (recommended `64x64`, transparent background) – shown in the top-left coin counter with spin animation.
+- `alert.png` (recommended `80x80`, transparent background) – reserved for warning/notification badge usage.
+
+If a PNG is missing, the UI falls back to emoji placeholders.
 
EOF
)
