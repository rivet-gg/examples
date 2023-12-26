use anyhow::{Context, Result};
use semver::Version as SemVer;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tera::Tera;

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    meta: ConfigMeta,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConfigMeta {
    engine_version: Option<SemVer>,
    language: String,
    rendering: String,
    features: Vec<String>,
}

fn main() -> Result<()> {
    let mut tera = Tera::default();
    tera.add_raw_template("README.md", include_str!("../tpl/README.md.tera"))?;

    for entry in walkdir::WalkDir::new(".") {
        let entry = entry?;
        if entry.file_name() == "example.toml" {
            template_dir(&tera, entry.path().parent().context("path.parent")?)?;
        }
    }

    Ok(())
}

fn template_dir(tera: &Tera, path: &Path) -> Result<()> {
    // Read config
    let config: Config = toml::from_str(&fs::read_to_string(path.join("example.toml"))?)?;

    // Template Tera
    let mut context = tera::Context::new();
    context.insert("config", &config);

    // Write README
    let readme_content = tera.render("README.md", &context)?;
    fs::write(path.join("README.md"), readme_content)?;

    fs::write(path.join("LICENSE"), include_str!("../../../LICENSE"))?;

    fs::write(path.join("LICENSE"), include_str!("../../../LICENSE"))?;

    // TODO: Write .gitignore
    // TODO: Write LICENSE

    Ok(())
}
