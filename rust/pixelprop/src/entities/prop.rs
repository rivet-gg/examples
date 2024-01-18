use std::sync::Arc;
use crate::entities::{EntityBody, EntityKindInner};
use crate::utils::{Vector, Rect};
use crate::game_config::PrefabConfig;
use crate::game_config::PrefabKind;
use crate::game_config::ObjectConfig;
use crate::game_config::ObjectConfigHandle;
use crate::game_config::PrefabConfigHandle;

/// Any prop on the map, could be controlled by the player
pub struct Prop {
    pub object: ObjectConfigHandle,
    pub prefab: PrefabConfigHandle
}

impl Prop {
    pub fn from_prefab(object: ObjectConfigHandle, prefab: PrefabConfigHandle) -> Prop {
        Prop { object, prefab }
    }
}

impl EntityKindInner for Prop {
    fn is_selectable(&self) -> bool {
        // Make the props selectable
        match self.prefab.kind {
            PrefabKind::Fixture => false,
            PrefabKind::Prop { .. } => true
        }
    }

    fn get_prefab(&self) -> PrefabConfigHandle {
        self.prefab.clone()
    }

    fn create_body(&self) -> EntityBody {
        EntityBody::new(
            match self.prefab.kind {
                PrefabKind::Prop { .. } => false, PrefabKind::Fixture => true
            },
            self.object.position.clone(),
            Vector::zero(),
            self.object.rotation,
            self.prefab.rects.clone()
        )
    }
}
