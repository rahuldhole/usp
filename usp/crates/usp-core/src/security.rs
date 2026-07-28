pub struct SecurityPolicy;

impl SecurityPolicy {
    /// Enforces namespace partitioning:
    /// Client processes are strictly forbidden from writing or deleting `private.*` keys.
    pub fn is_client_mutation_allowed(key: &str) -> bool {
        !key.starts_with("private.") && key != "private"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_security_policy() {
        assert!(SecurityPolicy::is_client_mutation_allowed("user.theme"));
        assert!(SecurityPolicy::is_client_mutation_allowed("public.config"));
        assert!(!SecurityPolicy::is_client_mutation_allowed("private.api_key"));
        assert!(!SecurityPolicy::is_client_mutation_allowed("private.db.password"));
        assert!(!SecurityPolicy::is_client_mutation_allowed("private"));
    }
}
