use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SessionMeta {
    pub session_id: String,
    pub ttl_seconds: u64,
    pub created_at: u64,
}

impl SessionMeta {
    pub fn new(session_id: String, ttl_seconds: u64, current_timestamp: u64) -> Self {
        Self {
            session_id,
            ttl_seconds,
            created_at: current_timestamp,
        }
    }

    pub fn is_expired(&self, current_timestamp: u64) -> bool {
        current_timestamp >= self.created_at + self.ttl_seconds
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_ttl() {
        let session = SessionMeta::new("session123".to_string(), 1800, 1000);
        assert!(!session.is_expired(2000));
        assert!(session.is_expired(2800));
        assert!(session.is_expired(3000));
    }
}
