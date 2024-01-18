use std::path::Path;

use anyhow::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Link {
    title: String,
    value: String,
    url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateFeature {
    name: String,
    url: String,
}

/// Used for an overview of the feature
#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateOverview {
    path: String,
    config: super::Config,
    has_preview: bool,
    engine: String,
    engine_id: super::meta::Engine,
    language: String,
    platforms: String,
    networking: String,
    rendering: String,
    features: String,
}

impl super::Config {
    pub fn tpl_meta(&self) -> Vec<Link> {
        let mut meta = Vec::new();
        if let Some(engine_version) = &self.meta.engine_version {
            meta.push(Link {
                title: "Engine Version".to_owned(),
                value: engine_version.to_string(),
                url: None,
            });
        }
        meta.push(Link {
            title: "Language".into(),
            value: self
                .meta
                .languages
                .iter()
                .map(|x| x.to_string())
                .collect::<Vec<_>>()
                .join(" & "),
            url: Some(self.meta.languages[0].url().to_owned()),
        });
        if let Some(networking) = &self.meta.networking {
            meta.push(Link {
                title: "Networking".into(),
                value: networking.to_string(),
                url: Some(networking.url().to_owned()),
            });
        }
        if let Some(rendering) = &self.meta.rendering {
            meta.push(Link {
                title: "Rendering".into(),
                value: rendering.to_string(),
                url: Some(rendering.url().to_owned()),
            });
        }

        meta
    }

    pub fn tpl_features(&self) -> Vec<TemplateFeature> {
        self.meta
            .features
            .iter()
            .map(|x| TemplateFeature {
                name: x.to_string(),
                url: x.url().to_owned(),
            })
            .collect::<Vec<_>>()
    }

    pub fn tpl_overview(&self, path: &Path) -> Result<TemplateOverview> {
        Ok(TemplateOverview {
            path: path.display().to_string(),
            config: self.clone(),
            has_preview: path.join("_media").join("preview.png").exists(),
            engine: self.meta.engine.to_string(),
            engine_id: self.meta.engine.clone(),
            language: self
                .meta
                .languages
                .iter()
                .map(|x| x.to_string())
                .collect::<Vec<_>>()
                .join(" & "),
            platforms: self
                .meta
                .platforms
                .iter()
                .map(|x| x.to_string())
                .collect::<Vec<_>>()
                .join(" "),
            networking: self
                .meta
                .networking
                .as_ref()
                .map(|x| x.to_string())
                .unwrap_or_default(),
            rendering: self
                .meta
                .rendering
                .as_ref()
                .map(|x| x.to_string())
                .unwrap_or_default(),
            features: self
                .meta
                .features
                .iter()
                .map(|x| format!("[{}]({} \"{}\")", x.emoji(), x.url(), x))
                .collect::<Vec<_>>()
                .join(""),
        })
    }
}
