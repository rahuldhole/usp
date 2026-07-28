use usp_core::{DiffEngine, SecurityPolicy};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn validate_security(key: &str) -> bool {
    SecurityPolicy::is_client_mutation_allowed(key)
}

#[wasm_bindgen]
pub fn parse_mutation(payload: &str) -> Result<JsValue, JsValue> {
    match DiffEngine::parse_mutation(payload) {
        Ok(mutation) => Ok(JsValue::from_str(&serde_json::to_string(&mutation).unwrap())),
        Err(err) => Err(JsValue::from_str(&err.to_string())),
    }
}

#[wasm_bindgen]
pub fn process_sync_frame(payload: &str) -> Result<JsValue, JsValue> {
    match DiffEngine::parse_mutation(payload) {
        Ok(mutation) => match &mutation {
            usp_core::Mutation::Set { key, .. } | usp_core::Mutation::Delete { key, .. } => {
                if !SecurityPolicy::is_client_mutation_allowed(key) {
                    Err(JsValue::from_str("Forbidden: Private namespace write attempt"))
                } else {
                    Ok(JsValue::from_str(&serde_json::to_string(&mutation).unwrap()))
                }
            }
            _ => Ok(JsValue::from_str(&serde_json::to_string(&mutation).unwrap())),
        },
        Err(err) => Err(JsValue::from_str(&err.to_string())),
    }
}
