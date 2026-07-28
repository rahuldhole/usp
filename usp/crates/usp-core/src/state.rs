use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
#[serde(tag = "op")]
pub enum Mutation {
    #[serde(rename = "SET")]
    Set {
        session: String,
        key: String,
        val: Value,
        #[serde(rename = "clientId")]
        client_id: Option<String>,
        hlc: Option<String>,
    },
    #[serde(rename = "DELETE")]
    Delete {
        session: String,
        key: String,
        #[serde(rename = "clientId")]
        client_id: Option<String>,
        hlc: Option<String>,
    },
    #[serde(rename = "EXEC")]
    Exec {
        session: String,
        action: String,
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
        session: &str,
    ) -> Vec<Mutation> {
        current.diff(session, old)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_set_mutation() {
        let payload = r#"{"op":"SET","session":"session_123","key":"user.theme","val":"dark","clientId":"k7f3x","hlc":"1700000000000-0000-node1"}"#;
        let mutation = DiffEngine::parse_mutation(payload).unwrap();
        assert_eq!(
            mutation,
            Mutation::Set {
                session: "session_123".to_string(),
                key: "user.theme".to_string(),
                val: json!("dark"),
                client_id: Some("k7f3x".to_string()),
                hlc: Some("1700000000000-0000-node1".to_string()),
            }
        );
    }

    #[test]
    fn test_parse_exec_mutation() {
        let payload = r#"{"op":"EXEC","session":"session_123","action":"trigger_workflow"}"#;
        let mutation = DiffEngine::parse_mutation(payload).unwrap();
        assert_eq!(
            mutation,
            Mutation::Exec {
                session: "session_123".to_string(),
                action: "trigger_workflow".to_string(),
                client_id: None,
            }
        );
    }
}
