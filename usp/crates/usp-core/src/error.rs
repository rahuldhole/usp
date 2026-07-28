use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "code", content = "details")]
pub enum UspError {
    #[serde(rename = "ERR_SERIALIZATION")]
    Serialization(String),
    
    #[serde(rename = "ERR_SECURITY_FORBIDDEN")]
    SecurityForbidden(String),
    
    #[serde(rename = "ERR_PAYLOAD_TOO_LARGE")]
    PayloadTooLarge { max_size: usize, actual_size: usize },
    
    #[serde(rename = "ERR_INVALID_HLC")]
    InvalidHlc(String),
    
    #[serde(rename = "ERR_INVALID_MUTATION")]
    InvalidMutation(String),

    #[serde(rename = "ERR_INTERNAL")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, UspError>;

impl fmt::Display for UspError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UspError::Serialization(msg) => write!(f, "ERR_SERIALIZATION: {}", msg),
            UspError::SecurityForbidden(msg) => write!(f, "ERR_SECURITY_FORBIDDEN: {}", msg),
            UspError::PayloadTooLarge { max_size, actual_size } => {
                write!(
                    f,
                    "ERR_PAYLOAD_TOO_LARGE: Value size ({} bytes) exceeds maximum allowed size ({} bytes)",
                    actual_size, max_size
                )
            }
            UspError::InvalidHlc(msg) => write!(f, "ERR_INVALID_HLC: {}", msg),
            UspError::InvalidMutation(msg) => write!(f, "ERR_INVALID_MUTATION: {}", msg),
            UspError::Internal(msg) => write!(f, "ERR_INTERNAL: {}", msg),
        }
    }
}

impl std::error::Error for UspError {}

impl From<serde_json::Error> for UspError {
    fn from(err: serde_json::Error) -> Self {
        UspError::Serialization(err.to_string())
    }
}
