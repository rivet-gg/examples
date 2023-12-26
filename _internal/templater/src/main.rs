use anyhow::{Context, Result};
use semver::Version as SemVer;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tera::Tera;

#[derive(Clone, Debug, Serialize, Deserialize)]
enum ConfigMetaEngine {
    Godot,
    Unity,
    Unreal,
    HTML5,
    Custom,
}

impl ConfigMetaEngine {
    fn deploy_docs_url(&self) -> &'static str {
        match self {
            // TODO: Build better docs for this
            Self::Godot => {
                "https://rivet.gg/learn/godot/tutorials/crash-course#step-4-deploy-to-rivet"
            }
            // TODO: Build better docs for this
            Self::Unity => {
                "https://rivet.gg/learn/unity/tutorials/fishnet/crash-course#deploying-to-rivet"
            }
            // TODO: Build better docs for this
            Self::Unreal => "https://rivet.gg/learn/unreal/tutorials/crash-course/40-deploy-rivet",
            Self::HTML5 => {
                // TODO: Build better docs for this
                "https://rivet.gg/learn/html5/tutorials/crash-course#step-3-publish-your-game"
            }
            Self::Custom => {
                // TODO: Build better docs for this
                "https://rivet.gg/learn/html5/tutorials/crash-course#step-3-publish-your-game"
            }
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
enum ConfigMetaLanguage {
    TypeScript,
    C,
    CPlusPlus,
    CSharp,
    Rust,
    GDScript,
}

impl ConfigMetaLanguage {
    fn url(&self) -> &'static str {
        match self {
            Self::TypeScript => "https://www.typescriptlang.org",
            Self::C => "https://www.iso.org/standard/74528.html",
            Self::CPlusPlus => "https://isocpp.org",
            Self::CSharp => "https://docs.microsoft.com/en-us/dotnet/csharp/",
            Self::Rust => "https://www.rust-lang.org",
            Self::GDScript => "https://docs.godotengine.org/en/stable/getting_started/scripting/gdscript/gdscript_basics.html",
        }
    }
}

impl std::fmt::Display for ConfigMetaLanguage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TypeScript => write!(f, "TypeScript"),
            Self::C => write!(f, "C"),
            Self::CPlusPlus => write!(f, "C++"),
            Self::CSharp => write!(f, "C#"),
            Self::Rust => write!(f, "Rust"),
            Self::GDScript => write!(f, "GDScript"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
enum ConfigMetaNetworking {
    WebSocket,
    WebRTC,
    SocketIo,
    Colyseus,
    GodotHLMultiplayer,
    FishNet,
    UnrealReplication,
}

impl ConfigMetaNetworking {
    fn url(&self) -> &'static str {
        match self {
            Self::WebSocket => "https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API",
            Self::WebRTC => "https://webrtc.org",
            Self::SocketIo => "https://socket.io",
            Self::Colyseus => "https://github.com/rivet-gg/plugin-colyseus-server'",
            Self::GodotHLMultiplayer => "https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html",
            Self::FishNet => "https://fish-networking.gitbook.io/docs/",
            Self::UnrealReplication => "https://docs.unrealengine.com/en-US/Gameplay/Networking/Actors/Replication/index.html",
        }
    }
}

impl std::fmt::Display for ConfigMetaNetworking {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WebSocket => write!(f, "WebSocket"),
            Self::WebRTC => write!(f, "WebRTC"),
            Self::SocketIo => write!(f, "Socket.IO"),
            Self::Colyseus => write!(f, "Colyseus"),
            Self::GodotHLMultiplayer => write!(f, "High-Level Multiplayer"),
            Self::FishNet => write!(f, "Fish-Networking"),
            Self::UnrealReplication => write!(f, "Actor Replication"),
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
    networking: Option<ConfigMetaNetworking>,
    rendering: Option<ConfigMetaRendering>,
    features: Vec<ConfigMetaFeature>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConfigDisplay {
    title: String,
    tutorial_url: Option<String>,
    preview_file: Option<String>,
    overview_weight: Option<f64>,
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
    tera.add_raw_template(
        "example/README.md",
        include_str!("../tpl/example/README.md.tera"),
    )?;

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
