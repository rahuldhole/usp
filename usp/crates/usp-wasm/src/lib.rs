use usp_core::{DiffEngine, Hlc, LwwMap, SecurityPolicy, UspError};
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
                    Err(JsValue::from_str(&UspError::SecurityForbidden("Forbidden: Private namespace write attempt".to_string()).to_string()))
                } else {
                    Ok(JsValue::from_str(&serde_json::to_string(&mutation).unwrap()))
                }
            }
            _ => Ok(JsValue::from_str(&serde_json::to_string(&mutation).unwrap())),
        },
        Err(err) => Err(JsValue::from_str(&err.to_string())),
    }
}

#[wasm_bindgen]
pub fn get_storage_key(payload: &str) -> Result<String, JsValue> {
    match DiffEngine::parse_mutation(payload) {
        Ok(mutation) => Ok(DiffEngine::get_storage_key(&mutation)),
        Err(err) => Err(JsValue::from_str(&err.to_string())),
    }
}

#[wasm_bindgen]
pub fn should_broadcast(payload: &str) -> Result<bool, JsValue> {
    match DiffEngine::parse_mutation(payload) {
        Ok(mutation) => Ok(DiffEngine::should_broadcast(&mutation)),
        Err(err) => Err(JsValue::from_str(&err.to_string())),
    }
}

#[wasm_bindgen]
pub struct WasmHlc {
    inner: Hlc,
}

#[wasm_bindgen]
impl WasmHlc {
    #[wasm_bindgen(constructor)]
    pub fn new(node_id: &str) -> Self {
        Self {
            inner: Hlc::now(node_id),
        }
    }

    #[wasm_bindgen(js_name = "fromTimestamp")]
    pub fn from_timestamp(node_id: &str, timestamp_ms: f64, counter: u32) -> Self {
        Self {
            inner: Hlc::new(node_id, timestamp_ms as u64, counter),
        }
    }

    #[wasm_bindgen]
    pub fn inc(&mut self, current_time_ms: f64) -> String {
        self.inner.inc(current_time_ms as u64);
        self.inner.pack()
    }

    #[wasm_bindgen(js_name = "incNow")]
    pub fn inc_now(&mut self) -> String {
        self.inner.inc_now()
    }

    #[wasm_bindgen]
    pub fn receive(&mut self, remote_hlc: &str, current_time_ms: Option<f64>) -> Result<(), JsValue> {
        self.inner
            .receive(remote_hlc, current_time_ms.map(|val| val as u64))
            .map_err(|err| JsValue::from_str(&err.to_string()))
    }

    #[wasm_bindgen]
    pub fn pack(&self) -> String {
        self.inner.pack()
    }

    #[wasm_bindgen(js_name = "compare")]
    pub fn compare(a_str: &str, b_str: &str) -> Result<i32, JsValue> {
        let a = Hlc::parse(a_str).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let b = Hlc::parse(b_str).map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(match a.cmp(&b) {
            std::cmp::Ordering::Less => -1,
            std::cmp::Ordering::Equal => 0,
            std::cmp::Ordering::Greater => 1,
        })
    }
}

#[wasm_bindgen]
pub struct WasmLwwMap {
    inner: LwwMap,
}

#[wasm_bindgen]
impl WasmLwwMap {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: LwwMap::new(),
        }
    }

    #[wasm_bindgen(js_name = "applyMutation")]
    pub fn apply_mutation(&mut self, mutation_json: &str, default_node_id: &str) -> Result<bool, JsValue> {
        let mutation = DiffEngine::parse_mutation(mutation_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(self.inner.apply_mutation(&mutation, default_node_id))
    }

    #[wasm_bindgen(js_name = "toJson")]
    pub fn to_json(&self) -> Result<JsValue, JsValue> {
        let val = self.inner.to_json();
        Ok(JsValue::from_str(&serde_json::to_string(&val).unwrap()))
    }

    #[wasm_bindgen(js_name = "computeDiff")]
    pub fn compute_diff(&self, channel: Option<String>, old_map: &WasmLwwMap) -> Result<JsValue, JsValue> {
        let deltas = self.inner.diff(channel.as_deref(), &old_map.inner);
        Ok(JsValue::from_str(&serde_json::to_string(&deltas).unwrap()))
    }
}
