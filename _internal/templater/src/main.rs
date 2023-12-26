mod example;

use anyhow::{Context, Result};
use rayon::prelude::*;
use std::{
    fs,
    path::{Path, PathBuf},
};
use tera::Tera;
use walkdir::WalkDir;

fn main() -> Result<()> {
    let mut tera = Tera::default();
    tera.add_raw_template(
        "example/README.md",
        include_str!("../tpl/example/README.md.tera"),
    )?;
    tera.add_raw_template("root/README.md", include_str!("../tpl/root/README.md.tera"))?;

    // Template examples
    // let mut example_configs = Vec::new();
    // for entry in walkdir::WalkDir::new(".") {
    //     let entry = entry?;
    //     if entry.file_name() == "example.toml" {
    //         let path = entry.path().parent().context("path.parent")?.to_owned();
    //         let config = toml::from_str::<example::Config>(&fs::read_to_string(entry.path())?)?;

    //         template_example(&config, &tera, &path)?;

    //         example_configs.push((path, config));
    //     }
    // }

    let entries: Vec<_> = WalkDir::new(".")
        .into_iter()
        .filter_map(Result::ok)
        .collect();

    let mut example_configs = entries
        .par_iter()
        .filter(|entry| entry.file_name() == "example.toml")
        .filter_map(|entry| {
            let path = entry
                .path()
                .parent()
                .context("path.parent")
                .ok()?
                .to_owned();
            let config_str = fs::read_to_string(entry.path()).ok()?;
            let config = toml::from_str::<example::Config>(&config_str).ok()?;

            template_example(&config, &tera, &path).ok()?;

            Some((path, config))
        })
        .collect::<Vec<(PathBuf, example::Config)>>();

    // Sort examples & template for overview
    example_configs.sort_by_key(|(_, config)| -config.display.overview_weight.unwrap_or(0));
    let example_configs = example_configs
        .into_iter()
        .map(|(path, config)| config.tpl_overview(&path))
        .collect::<Result<Vec<_>>>()?;

    // Template root
    template_root(&tera, &example_configs)?;

    Ok(())
}

fn template_example(config: &example::Config, tera: &Tera, path: &Path) -> Result<()> {
    let mut context = tera::Context::new();

    context.insert("config", &config);

    context.insert(
        "has_preview",
        &path.join("_media").join("preview.png").exists(),
    );

    context.insert("meta", &config.tpl_meta());

    context.insert("features", &config.tpl_features());

    context.insert("deploy_docs_url", &config.meta.engine.deploy_docs_url());

    // Resize preview
    let preview_path = path.join("_media").join("preview.png");
    if preview_path.exists() {
        let img = image::open(&preview_path)?;

        let path_clone = preview_path.clone();
        let (a, b) = rayon::join(
            || resize_and_save(&img, &path_clone, 128),
            || resize_and_save(&img, &preview_path, 512),
        );
        a?;
        b?;
    }

    // Write README
    let readme_content = tera.render("example/README.md", &context)?;
    fs::write(path.join("README.md"), readme_content)?;

    // Write LICENSE
    fs::write(path.join("LICENSE"), include_str!("../../../LICENSE"))?;

    Ok(())
}

fn template_root(tera: &Tera, example_configs: &[example::tpl::TemplateOverview]) -> Result<()> {
    let mut context = tera::Context::new();
    context.insert("examples", example_configs);

    let readme_content = tera.render("root/README.md", &context)?;
    fs::write("README.md", readme_content)?;

    Ok(())
}

fn resize_and_save(img: &image::DynamicImage, path: &PathBuf, width: u32) -> Result<()> {
    let resized = img.resize(width, img.height(), image::imageops::FilterType::Lanczos3);
    resized.save(path.with_file_name(format!("preview_{}.png", width)))?;
    Ok(())
}
