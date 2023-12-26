mod example;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tera::Tera;

/// Example information to render the root template
#[derive(Debug, Serialize, Deserialize)]
struct RootExampleTemplate {
    config: example::Config,
    meta: Vec<example::tpl::TemplateMeta>,
    features: Vec<example::tpl::TemplateFeature>,
}

fn main() -> Result<()> {
    let mut tera = Tera::default();
    tera.add_raw_template(
        "example/README.md",
        include_str!("../tpl/example/README.md.tera"),
    )?;
    tera.add_raw_template("root/README.md", include_str!("../tpl/root/README.md.tera"))?;

    // Template examples
    let mut example_configs = Vec::new();
    for entry in walkdir::WalkDir::new(".") {
        let entry = entry?;
        if entry.file_name() == "example.toml" {
            template_example(
                &mut example_configs,
                &tera,
                entry.path().parent().context("path.parent")?,
            )?;
        }
    }

    // Sort examples & template for overview
    example_configs.sort_by_key(|x| -x.display.overview_weight.unwrap_or(0));
    let example_configs = example_configs
        .into_iter()
        .map(|config| RootExampleTemplate {
            meta: config.tpl_meta(),
            features: config.tpl_features(),
            config,
        })
        .collect::<Vec<_>>();

    // Template root
    template_root(&tera, &example_configs)?;

    Ok(())
}

fn template_example(configs: &mut Vec<example::Config>, tera: &Tera, path: &Path) -> Result<()> {
    // Read config
    let config =
        toml::from_str::<example::Config>(&fs::read_to_string(path.join("example.toml"))?)?;
    configs.push(config.clone());

    let mut context = tera::Context::new();

    context.insert("config", &config);

    context.insert("meta", &config.tpl_meta());

    context.insert("features", &config.tpl_features());

    context.insert("deploy_docs_url", &config.meta.engine.deploy_docs_url());

    // Write README
    let readme_content = tera.render("example/README.md", &context)?;
    fs::write(path.join("README.md"), readme_content)?;

    // Write LICENSE
    fs::write(path.join("LICENSE"), include_str!("../../../LICENSE"))?;

    Ok(())
}

fn template_root(tera: &Tera, example_configs: &[RootExampleTemplate]) -> Result<()> {
    let mut context = tera::Context::new();
    context.insert("examples", example_configs);

    let readme_content = tera.render("root/README.md", &context)?;
    fs::write("README.md", readme_content)?;

    Ok(())
}
