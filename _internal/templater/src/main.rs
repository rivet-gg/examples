mod example;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tera::Tera;

#[derive(Debug, Serialize, Deserialize)]
struct TemplateMeta {
    title: String,
    value: String,
    url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TemplateFeature {
    name: String,
    url: String,
}

fn main() -> Result<()> {
    let mut tera = Tera::default();
    tera.add_raw_template(
        "example/README.md",
        include_str!("../tpl/example/README.md.tera"),
    )?;

    let mut example_configs = Vec::new();
    for entry in walkdir::WalkDir::new(".") {
        let entry = entry?;
        if entry.file_name() == "example.toml" {
            template_dir(
                &mut example_configs,
                &tera,
                entry.path().parent().context("path.parent")?,
            )?;
        }
    }

    Ok(())
}

fn template_dir(configs: &mut Vec<example::Config>, tera: &Tera, path: &Path) -> Result<()> {
    // Read config
    let config: example::Config = toml::from_str(&fs::read_to_string(path.join("example.toml"))?)?;
    configs.push(config);

    let mut context = tera::Context::new();

    context.insert("config", &config);

    let mut meta = Vec::new();
    if let Some(engine_version) = &config.meta.engine_version {
        meta.push(TemplateMeta {
            title: "Engine Version".to_owned(),
            value: engine_version.to_string(),
            url: None,
        });
    }
    meta.push(TemplateMeta {
        title: "Language".into(),
        value: config.meta.language.to_string(),
        url: Some(config.meta.language.url().to_owned()),
    });
    if let Some(networking) = &config.meta.networking {
        meta.push(TemplateMeta {
            title: "Networking".into(),
            value: networking.to_string(),
            url: Some(networking.url().to_owned()),
        });
    }
    if let Some(rendering) = &config.meta.rendering {
        meta.push(TemplateMeta {
            title: "Rendering".into(),
            value: rendering.to_string(),
            url: Some(rendering.url().to_owned()),
        });
    }
    context.insert("meta", &meta);

    let features = config
        .meta
        .features
        .iter()
        .map(|x| TemplateFeature {
            name: x.to_string(),
            url: x.url().to_owned(),
        })
        .collect::<Vec<_>>();
    context.insert("features", &features);

    context.insert("deploy_docs_url", &config.meta.engine.deploy_docs_url());

    // Write README
    let readme_content = tera.render("example/README.md", &context)?;
    fs::write(path.join("README.md"), readme_content)?;

    // Write LICENSE
    fs::write(path.join("LICENSE"), include_str!("../../../LICENSE"))?;

    Ok(())
}
