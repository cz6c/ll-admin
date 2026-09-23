//! 双云同步共享工具
//! 职责：落盘命名谓词、协议 FetchGate、assets.dest_path remap
//! 适用：icloud_sync / qzone_sync；避免两源复制粘贴

pub mod fetch_gate;
pub mod naming;
pub mod remap;

pub use fetch_gate::FetchGate;
pub use remap::remap_assets_dest_paths;
