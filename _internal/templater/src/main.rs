use anyhow::{Context, Result};
use semver::Version as SemVer;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tera::Tera;

#[derive(Clone, Debug, Serialize, Deserialize)]
enum ConfigMetaEngine {
    HTML5,
}

impl ConfigMetaEngine {
    fn deploy_docs_url(&self) -> &'static str {
        match self {
            Self::HTML5 => {
                // TODO: Build better docs for this
                "https://rivet.gg/learn/html5/tutorials/crash-course#step-3-publish-your-game"
            }
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
enum ConfigMetaLanguage {
    TypeScript,
}

impl ConfigMetaLanguage {
    fn url(&self) -> &'static str {
        match self {
            Self::TypeScript => "https://www.typescriptlang.org",
        }
    }
}

impl std::fmt::Display for ConfigMetaLanguage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TypeScript => write!(f, "TypeScript"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
enum ConfigMetaNetworking {
    SocketIo,
}

impl ConfigMetaNetworking {
    fn url(&self) -> &'static str {
        match self {
            Self::SocketIo => "https://socket.io",
        }
    }
}

impl std::fmt::Display for ConfigMetaNetworking {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SocketIo => write!(f, "Socket.IO"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
enum ConfigMetaRendering {
    HTML5Canvas,
}

impl ConfigMetaRendering {
    fn url(&self) -> &'static str {
        match self {
            Self::HTML5Canvas => "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API",
        }
    }
}

impl std::fmt::Display for ConfigMetaRendering {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::HTML5Canvas => write!(f, "Canvas"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
enum ConfigMetaFeature {
    Matchmaker,
    DynamicServers,
}

impl ConfigMetaFeature {
    fn url(&self) -> &'static str {
        match self {
            Self::Matchmaker => "https://rivet.gg/docs/matchmaker",
            Self::DynamicServers => "https://rivet.gg/docs/dynamic-servers",
        }
    }
}

impl std::fmt::Display for ConfigMetaFeature {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Matchmaker => write!(f, "♟️ Matchmaker"),
            Self::DynamicServers => write!(f, "🌐 Dynamic Servers"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    meta: ConfigMeta,
    display: ConfigDisplay,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConfigMeta {
    engine: ConfigMetaEngine,
    engine_version: Option<SemVer>,
    language: ConfigMetaLanguage,
    networking: ConfigMetaNetworking,
    rendering: ConfigMetaRendering,
    features: Vec<ConfigMetaFeature>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConfigDisplay {
    title: String,
    tutorial_url: String,
    preview_file: Option<String>,
}

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
    meta.push(TemplateMeta {
        title: "Networking".into(),
        value: config.meta.networking.to_string(),
        url: Some(config.meta.networking.url().to_owned()),
    });
    meta.push(TemplateMeta {
        title: "Rendering".into(),
        value: config.meta.rendering.to_string(),
        url: Some(config.meta.rendering.url().to_owned()),
    });
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
    let readme_content = tera.render("README.md", &context)?;
    fs::write(path.join("README.md"), readme_content)?;

    fs::write(path.join("LICENSE"), include_str!("../../../LICENSE"))?;

    // TODO: Write .gitignore
    // TODO: Write LICENSE

    Ok(())
}
