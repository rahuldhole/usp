use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, Default)]
pub struct StateConfig {
    pub channel: Option<String>,
    pub password: Option<String>,
    pub access: Option<String>,
    pub mode: Option<String>,
    #[serde(rename = "maxSize", alias = "max_size", default, skip_serializing_if = "Option::is_none")]
    pub max_size: Option<usize>,
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

impl Mutation {
    pub fn validate(&self) -> crate::Result<()> {
        if let Mutation::Set { val, options: Some(options), .. } = self {
            if let Some(max_size) = options.max_size {
                let actual_size = match val {
                    Value::String(s) => s.len(),
                    other => serde_json::to_vec(other).map(|v| v.len()).unwrap_or(0),
                };
                if actual_size > max_size {
                    return Err(crate::UspError::PayloadTooLarge { max_size, actual_size });
                }
            }
        }
        Ok(())
    }
}

pub struct DiffEngine;

impl DiffEngine {
    pub fn parse_mutation(payload: &str) -> crate::Result<Mutation> {
        let mutation: Mutation = serde_json::from_str(payload)?;
        mutation.validate()?;
        Ok(mutation)
    }

    pub fn generate_sync_payload(mutation: &Mutation) -> crate::Result<String> {
        mutation.validate()?;
        Ok(serde_json::to_string(mutation)?)
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
            Mutation::Exec { .. } => return format!("exec"), // Not stored
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
                    max_size: None,
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
                    max_size: None,
                }),
                client_id: None,
            }
        );
    }

    #[test]
    fn test_max_size_validation() {
        let valid = r#"{"op":"SET","key":"short","val":"hello","options":{"maxSize":10}}"#;
        assert!(DiffEngine::parse_mutation(valid).is_ok());

        let invalid = r#"{"op":"SET","key":"long","val":"this is string is longer than 10 bytes","options":{"maxSize":10}}"#;
        let res = DiffEngine::parse_mutation(invalid);
        assert!(matches!(res, Err(crate::UspError::PayloadTooLarge { max_size: 10, .. })));
    }
}
