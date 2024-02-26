// https://github.com/GyulyVGC/sniffnet/blob/main/src/networking/types/address_port_pair.rs#L7

//! Module defining the `AddressPortPair` struct, which represents a network address:port pair.

/// Struct representing a network address:port pair.
#[derive(PartialEq, Eq, Hash, Clone, Debug)]
pub struct AddressPortPair {
    /// Network layer IPv4 or IPv6 source address.
    pub address1: String,
    /// Transport layer source port number (in the range 0..=65535).
    pub port1: Option<u16>,
    /// Network layer IPv4 or IPv6 destination address.
    pub address2: String,
    /// Transport layer destination port number (in the range 0..=65535).
    pub port2: Option<u16>
}

impl AddressPortPair {
    /// Returns a new `AddressPort` element.
    ///
    /// # Arguments
    ///
    /// * `address` - A string representing the network layer IPv4 or IPv6 address.
    ///
    /// * `port` - An integer representing the transport layer port number (in the range 0..=65535).
    pub fn new(
        address1: String,
        port1: Option<u16>,
        address2: String,
        port2: Option<u16>
    ) -> Self {
        AddressPortPair {
            address1,
            port1,
            address2,
            port2
        }
    }
}
