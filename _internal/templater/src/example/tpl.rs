use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateMeta {
    title: String,
    value: String,
    url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateFeature {
    name: String,
    url: String,
}

impl super::Config {
    pub fn tpl_meta(&self) -> Vec<TemplateMeta> {
        let mut meta = Vec::new();
        if let Some(engine_version) = &self.meta.engine_version {
            meta.push(TemplateMeta {
                title: "Engine Version".to_owned(),
                value: engine_version.to_string(),
                url: None,
            });
        }
        meta.push(TemplateMeta {
            title: "Language".into(),
            value: self.meta.language.to_string(),
            url: Some(self.meta.language.url().to_owned()),
        });
        if let Some(networking) = &self.meta.networking {
            meta.push(TemplateMeta {
                title: "Networking".into(),
                value: networking.to_string(),
                url: Some(networking.url().to_owned()),
            });
        }
        if let Some(rendering) = &self.meta.rendering {
            meta.push(TemplateMeta {
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
}
