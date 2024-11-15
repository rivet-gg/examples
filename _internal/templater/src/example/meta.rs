use semver::Version as SemVer;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Meta {
    pub engine: Engine,
    pub engine_version: Option<SemVer>,
    pub languages: Vec<Language>,
    pub platforms: Vec<Platform>,
    pub networking: Option<Networking>,
    pub rendering: Option<Rendering>,
    pub features: Vec<Feature>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Engine {
    Godot,
    Unity,
    Unreal,
    JavaScript,
    Custom,
}

impl Engine {
    pub fn deploy_docs_url(&self) -> &'static str {
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
            Self::JavaScript => {
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

impl std::fmt::Display for Engine {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Godot => write!(f, "Godot"),
            Self::Unity => write!(f, "Unity"),
            Self::Unreal => write!(f, "Unreal"),
            Self::JavaScript => write!(f, "JavaScript"),
            Self::Custom => write!(f, "Custom"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Platform {
    HTML5,
    Desktop,
}

impl std::fmt::Display for Platform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::HTML5 => write!(f, "HTML5"),
            Self::Desktop => write!(f, "Desktop"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Language {
    TypeScript,
    C,
    CPlusPlus,
    CSharp,
    Rust,
    GDScript,
}

impl Language {
    pub fn url(&self) -> &'static str {
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

impl std::fmt::Display for Language {
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
pub enum Networking {
    WebSocket,
    WebRTC,
    SocketIo,
    Colyseus,
    GodotHLMultiplayer,
    FishNet,
    UnrealReplication,
}

impl Networking {
    pub fn url(&self) -> &'static str {
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

impl std::fmt::Display for Networking {
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
pub enum Rendering {
    HTML5Canvas,
    HTML5DOM,
    PixiJS,
    BabylonJS,
}

impl Rendering {
    pub fn url(&self) -> &'static str {
        match self {
            Self::HTML5Canvas => "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API",
            Self::HTML5DOM => {
                "https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model"
            }
            Self::PixiJS => "https://www.pixijs.com",
            Self::BabylonJS => "https://www.babylonjs.com",
        }
    }
}

impl std::fmt::Display for Rendering {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::HTML5Canvas => write!(f, "Canvas"),
            Self::HTML5DOM => write!(f, "DOM"),
            Self::PixiJS => write!(f, "PixiJS"),
            Self::BabylonJS => write!(f, "BabylonJS"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Feature {
    Matchmaker,
    DynamicServers,
}

impl Feature {
    pub fn url(&self) -> &'static str {
        match self {
            Self::Matchmaker => "https://rivet.gg/docs/matchmaker",
            Self::DynamicServers => "https://rivet.gg/docs/dynamic-servers",
        }
    }

    pub fn emoji(&self) -> &'static str {
        match self {
            Self::Matchmaker => "♟️",
            Self::DynamicServers => "🌐",
        }
    }
}

impl std::fmt::Display for Feature {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ", self.emoji())?;
        match self {
            Self::Matchmaker => write!(f, "Matchmaker"),
            Self::DynamicServers => write!(f, "Dynamic Servers"),
        }
    }
}
