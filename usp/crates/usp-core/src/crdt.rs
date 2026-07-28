use crate::hlc::Hlc;
use crate::state::Mutation;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LwwEntry {
    /// `None` represents a tombstone for a deleted item
    pub value: Option<Value>,
    pub hlc: Hlc,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct LwwMap {
    pub entries: HashMap<String, LwwEntry>,
}

impl LwwMap {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    /// Applies a mutation to the map using HLC timestamps for LWW resolution.
    /// Returns `true` if state was modified, `false` if rejected as outdated.
    pub fn apply_mutation(&mut self, mutation: &Mutation, default_node_id: &str) -> bool {
        match mutation {
            Mutation::Set { key, val, hlc, client_id, .. } => {
                let parsed_hlc = match hlc {
                    Some(hlc_str) => Hlc::parse(hlc_str).ok(),
                    None => None,
                }.unwrap_or_else(|| Hlc::now(client_id.as_deref().unwrap_or(default_node_id)));

                if let Some(existing) = self.entries.get(key) {
                    if existing.hlc >= parsed_hlc {
                        return false; // Outdated or identical timestamp, ignore
                    }
                }
                self.entries.insert(
                    key.clone(),
                    LwwEntry {
                        value: Some(val.clone()),
                        hlc: parsed_hlc,
                    },
                );
                true
            }
            Mutation::Delete { key, hlc, client_id, .. } => {
                let parsed_hlc = match hlc {
                    Some(hlc_str) => Hlc::parse(hlc_str).ok(),
                    None => None,
                }.unwrap_or_else(|| Hlc::now(client_id.as_deref().unwrap_or(default_node_id)));

                if let Some(existing) = self.entries.get(key) {
                    if existing.hlc >= parsed_hlc {
                        return false;
                    }
                }
                // Store a tombstone
                self.entries.insert(
                    key.clone(),
                    LwwEntry {
                        value: None,
                        hlc: parsed_hlc,
                    },
                );
                true
            }
            Mutation::Exec { .. } => false,
        }
    }

    /// Retrieves the active state as a JSON Object, excluding tombstones.
    pub fn to_json(&self) -> Value {
        let mut map = serde_json::Map::new();
        for (k, entry) in &self.entries {
            if let Some(val) = &entry.value {
                map.insert(k.clone(), val.clone());
            }
        }
        Value::Object(map)
    }

    /// Computes diff mutations from this state relative to an older target state.
    pub fn diff(&self, session: &str, other: &LwwMap) -> Vec<Mutation> {
        let mut deltas = Vec::new();
        for (key, my_entry) in &self.entries {
            let should_emit = match other.entries.get(key) {
                Some(other_entry) => my_entry.hlc > other_entry.hlc,
                None => true,
            };

            if should_emit {
                match &my_entry.value {
                    Some(val) => deltas.push(Mutation::Set {
                        session: session.to_string(),
                        scope: None,
                        key: key.clone(),
                        val: val.clone(),
                        client_id: Some(my_entry.hlc.node_id.clone()),
                        hlc: Some(my_entry.hlc.pack()),
                    }),
                    None => deltas.push(Mutation::Delete {
                        session: session.to_string(),
                        scope: None,
                        key: key.clone(),
                        client_id: Some(my_entry.hlc.node_id.clone()),
                        hlc: Some(my_entry.hlc.pack()),
                    }),
                }
            }
        }
        deltas
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_lww_map_set_newer_overrides() {
        let mut map = LwwMap::new();
        let hlc_old = Hlc::new("nodeA", 1000, 1);
        let hlc_new = Hlc::new("nodeB", 2000, 1);

        let set1 = Mutation::Set {
            session: "s1".to_string(),
            scope: None,
            key: "user.theme".to_string(),
            val: json!("light"),
            client_id: Some("nodeA".to_string()),
            hlc: Some(hlc_old.pack()),
        };
        assert!(map.apply_mutation(&set1, "server"));
        assert_eq!(map.to_json()["user.theme"], json!("light"));

        let set2 = Mutation::Set {
            session: "s1".to_string(),
            scope: None,
            key: "user.theme".to_string(),
            val: json!("dark"),
            client_id: Some("nodeB".to_string()),
            hlc: Some(hlc_new.pack()),
        };
        assert!(map.apply_mutation(&set2, "server"));
        assert_eq!(map.to_json()["user.theme"], json!("dark"));
    }

    #[test]
    fn test_lww_map_set_older_rejected() {
        let mut map = LwwMap::new();
        let hlc_new = Hlc::new("nodeB", 2000, 1);
        let hlc_old = Hlc::new("nodeA", 1000, 1);

        let set_newer = Mutation::Set {
            session: "s1".to_string(),
            scope: None,
            key: "user.theme".to_string(),
            val: json!("dark"),
            client_id: Some("nodeB".to_string()),
            hlc: Some(hlc_new.pack()),
        };
        assert!(map.apply_mutation(&set_newer, "server"));

        let set_older = Mutation::Set {
            session: "s1".to_string(),
            scope: None,
            key: "user.theme".to_string(),
            val: json!("light"),
            client_id: Some("nodeA".to_string()),
            hlc: Some(hlc_old.pack()),
        };
        assert!(!map.apply_mutation(&set_older, "server")); // Rejected!
        assert_eq!(map.to_json()["user.theme"], json!("dark"));
    }

    #[test]
    fn test_lww_map_tombstone_prevents_resurrection() {
        let mut map = LwwMap::new();
        let hlc_del = Hlc::new("nodeB", 2000, 1);
        let hlc_old_set = Hlc::new("nodeA", 1000, 1);

        // Delete arrives first (maybe key existed on another node)
        let delete = Mutation::Delete {
            session: "s1".to_string(),
            scope: None,
            key: "user.theme".to_string(),
            client_id: Some("nodeB".to_string()),
            hlc: Some(hlc_del.pack()),
        };
        assert!(map.apply_mutation(&delete, "server"));
        assert_eq!(map.to_json(), json!({}));

        // Out-of-order older SET packet arrives later
        let old_set = Mutation::Set {
            session: "s1".to_string(),
            scope: None,
            key: "user.theme".to_string(),
            val: json!("light"),
            client_id: Some("nodeA".to_string()),
            hlc: Some(hlc_old_set.pack()),
        };
        assert!(!map.apply_mutation(&old_set, "server")); // Rejected by tombstone!
        assert_eq!(map.to_json(), json!({})); // Still empty/deleted
    }
}
