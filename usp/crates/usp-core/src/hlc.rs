use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fmt;

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn system_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn system_time_ms() -> u64 {
    js_sys::Date::now() as u64
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hlc {
    pub timestamp_ms: u64,
    pub counter: u32,
    pub node_id: String,
}

impl Hlc {
    pub fn new(node_id: impl Into<String>, timestamp_ms: u64, counter: u32) -> Self {
        Self {
            timestamp_ms,
            counter,
            node_id: node_id.into(),
        }
    }

    pub fn now(node_id: impl Into<String>) -> Self {
        let timestamp_ms = system_time_ms();
        Self {
            timestamp_ms,
            counter: 0,
            node_id: node_id.into(),
        }
    }

    /// Increments the clock using the given current physical timestamp in milliseconds.
    pub fn inc(&mut self, current_time_ms: u64) {
        if current_time_ms > self.timestamp_ms {
            self.timestamp_ms = current_time_ms;
            self.counter = 0;
        } else {
            self.counter += 1;
        }
    }

    /// Increments the clock using system physical wall-clock time and returns the packed string format.
    pub fn inc_now(&mut self) -> String {
        let now = system_time_ms();
        self.inc(now);
        self.pack()
    }

    /// Updates local clock upon receiving a remote HLC object.
    pub fn receive_hlc(&mut self, remote: &Hlc, current_time_ms: u64) {
        if current_time_ms > self.timestamp_ms && current_time_ms > remote.timestamp_ms {
            self.timestamp_ms = current_time_ms;
            self.counter = 0;
            return;
        }

        if self.timestamp_ms == remote.timestamp_ms {
            self.counter = self.counter.max(remote.counter) + 1;
        } else if self.timestamp_ms > remote.timestamp_ms {
            self.counter += 1;
        } else {
            self.timestamp_ms = remote.timestamp_ms;
            self.counter = remote.counter + 1;
        }
    }

    /// Updates local clock upon receiving a remote HLC formatted string.
    pub fn receive(&mut self, remote_hlc_str: &str, current_time_ms: Option<u64>) -> Result<(), &'static str> {
        let remote = Hlc::parse(remote_hlc_str)?;
        let now = current_time_ms.unwrap_or_else(system_time_ms);
        self.receive_hlc(&remote, now);
        Ok(())
    }

    /// Serializes to `<timestamp_ms>-<counter_base36>-<node_id>` format.
    pub fn pack(&self) -> String {
        format!("{}-{}-{}", self.timestamp_ms, to_base36(self.counter), self.node_id)
    }

    /// Parses an HLC string in the format `<timestamp_ms>-<counter_base36>-<node_id>`.
    pub fn parse(hlc_str: &str) -> Result<Self, &'static str> {
        let parts: Vec<&str> = hlc_str.splitn(3, '-').collect();
        if parts.len() != 3 {
            return Err("Invalid HLC format, expected <timestamp>-<counter>-<node_id>");
        }
        let timestamp_ms = parts[0].parse::<u64>().map_err(|_| "Invalid timestamp in HLC")?;
        let counter = u32::from_str_radix(parts[1], 36).map_err(|_| "Invalid base36 counter in HLC")?;
        let node_id = parts[2].to_string();
        Ok(Self {
            timestamp_ms,
            counter,
            node_id,
        })
    }
}

impl Ord for Hlc {
    fn cmp(&self, other: &Self) -> Ordering {
        self.timestamp_ms
            .cmp(&other.timestamp_ms)
            .then_with(|| self.counter.cmp(&other.counter))
            .then_with(|| self.node_id.cmp(&other.node_id))
    }
}

impl PartialOrd for Hlc {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Display for Hlc {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.pack())
    }
}

fn to_base36(mut n: u32) -> String {
    let chars: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut res = Vec::new();
    if n == 0 {
        res.push(b'0');
    } else {
        while n > 0 {
            res.push(chars[(n % 36) as usize]);
            n /= 36;
        }
    }
    while res.len() < 4 {
        res.push(b'0');
    }
    res.reverse();
    String::from_utf8(res).unwrap_or_else(|_| "0000".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hlc_pack_and_parse() {
        let hlc = Hlc::new("node1", 1700000000000, 35);
        let packed = hlc.pack();
        assert_eq!(packed, "1700000000000-000z-node1");
        let parsed = Hlc::parse(&packed).unwrap();
        assert_eq!(hlc, parsed);
    }

    #[test]
    fn test_hlc_inc_forward_time() {
        let mut hlc = Hlc::new("node1", 1000, 5);
        hlc.inc(2000);
        assert_eq!(hlc.timestamp_ms, 2000);
        assert_eq!(hlc.counter, 0);
    }

    #[test]
    fn test_hlc_inc_same_time() {
        let mut hlc = Hlc::new("node1", 1000, 5);
        hlc.inc(1000);
        assert_eq!(hlc.timestamp_ms, 1000);
        assert_eq!(hlc.counter, 6);
    }

    #[test]
    fn test_hlc_receive_remote_newer() {
        let mut local = Hlc::new("nodeA", 1000, 2);
        let remote_str = "2000-0005-nodeB";
        local.receive(remote_str, Some(1500)).unwrap();
        assert_eq!(local.timestamp_ms, 2000);
        assert_eq!(local.counter, 6);
    }

    #[test]
    fn test_hlc_compare_tie_breaker() {
        let hlc1 = Hlc::new("nodeA", 1000, 5);
        let hlc2 = Hlc::new("nodeB", 1000, 5);
        assert!(hlc1 < hlc2);
    }
}
