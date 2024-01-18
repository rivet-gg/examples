fn main() {
//    println!("is profile 2 {}", cfg!(profile));
    if cfg!(feature="profile") {
        println!("cargo:rustc-cfg=profile")
    }
}
