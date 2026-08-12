fn main() {
  // 仅改 icons 时默认不会触发重编，exe 内嵌图标会一直是旧的
  println!("cargo:rerun-if-changed=icons/icon.ico");
  println!("cargo:rerun-if-changed=icons/icon.png");
  println!("cargo:rerun-if-changed=icons/32x32.png");
  println!("cargo:rerun-if-changed=icons/128x128.png");
  println!("cargo:rerun-if-changed=icons/128x128@2x.png");
  println!("cargo:rerun-if-changed=icons/ccode-icon-b.png");
  tauri_build::build()
}
