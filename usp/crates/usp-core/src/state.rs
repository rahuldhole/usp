use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, Default)]
pub struct StateConfig {
    pub channel: Option<String>,
    pub password: Option<String>,
    pub access: Option<String>,
    pub mode: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
#[serde(tag = "op")]
pub enum Mutation {
    #[serde(rename = "SET")]
    Set {
        key: String,
        val: Value,
        options: Option<StateConfig>,
        #[serde(rename = "clientId")]
        client_id: Option<String>,
        hlc: Option<String>,
    },
    #[serde(rename = "DELETE")]
    Delete {
        key: String,
        options: Option<StateConfig>,
        #[serde(rename = "clientId")]
        client_id: Option<String>,
        hlc: Option<String>,
    },
    #[serde(rename = "EXEC")]
    Exec {
        action: String,
        options: Option<StateConfig>,
        #[serde(rename = "clientId")]
        client_id: Option<String>,
    },
}

pub struct DiffEngine;

impl DiffEngine {
    pub fn parse_mutation(payload: &str) -> Result<Mutation, serde_json::Error> {
        serde_json::from_str(payload)
    }

    pub fn generate_sync_payload(mutation: &Mutation) -> Result<String, serde_json::Error> {
        serde_json::to_string(mutation)
    }

    pub fn apply_mutation_to_state(
        state: &mut crate::crdt::LwwMap,
        mutation: &Mutation,
        default_node_id: &str,
    ) -> bool {
        state.apply_mutation(mutation, default_node_id)
    }

    pub fn compute_diff(
        current: &crate::crdt::LwwMap,
        old: &crate::crdt::LwwMap,
        channel: Option<&str>,
    ) -> Vec<Mutation> {
        current.diff(channel, old)
    }

    pub fn get_storage_key(mutation: &Mutation) -> String {
        let (key, options) = match mutation {
            Mutation::Set { key, options, .. } => (key, options),
            Mutation::Delete { key, options, .. } => (key, options),
            Mutation::Exec { options, .. } => return format!("exec"), // Not stored
        };
        
        let channel = options.as_ref().and_then(|o| o.channel.clone()).unwrap_or_else(|| key.clone());
        format!("{}:{}", channel, key)
    }

    pub fn should_broadcast(mutation: &Mutation) -> bool {
        let options = match mutation {
            Mutation::Set { options, .. } => options,
            Mutation::Delete { options, .. } => options,
            Mutation::Exec { options, .. } => options,
        };
        
        let access = options.as_ref().and_then(|o| o.access.clone()).unwrap_or_else(|| "global".to_string());
        access != "server"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_set_mutation() {
        let payload = r#"{"op":"SET","key":"user.theme","val":"dark","options":{"channel":"session_123","access":"global"},"clientId":"k7f3x","hlc":"1700000000000-0000-node1"}"#;
        let mutation = DiffEngine::parse_mutation(payload).unwrap();
        assert_eq!(
            mutation,
            Mutation::Set {
                key: "user.theme".to_string(),
                val: json!("dark"),
                options: Some(StateConfig {
                    channel: Some("session_123".to_string()),
                    access: Some("global".to_string()),
                    password: None,
                    mode: None,
                }),
                client_id: Some("k7f3x".to_string()),
                hlc: Some("1700000000000-0000-node1".to_string()),
            }
        );
    }

    #[test]
    fn test_parse_exec_mutation() {
        let payload = r#"{"op":"EXEC","action":"trigger_workflow","options":{"channel":"session_123"}}"#;
        let mutation = DiffEngine::parse_mutation(payload).unwrap();
        assert_eq!(
            mutation,
            Mutation::Exec {
                action: "trigger_workflow".to_string(),
                options: Some(StateConfig {
                    channel: Some("session_123".to_string()),
                    access: None,
                    password: None,
                    mode: None,
                }),
                client_id: None,
            }
        );
    }
}
