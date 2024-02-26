// From https://github.com/GyulyVGC/sniffnet/blob/main/src/networking/types/my_link_type.rs#L23

use pcap::Linktype;

/// Currently supported link types
#[derive(Copy, Clone)]
pub enum MyLinkType {
    Null(Linktype),
    Ethernet(Linktype),
    RawIp(Linktype),
    Loop(Linktype),
    IPv4(Linktype),
    IPv6(Linktype),
    Unsupported(Linktype),
    NotYetAssigned,
}

impl MyLinkType {
    pub fn is_supported(self) -> bool {
        !matches!(self, Self::Unsupported(_) | Self::NotYetAssigned)
    }

    pub fn from_pcap_link_type(link_type: Linktype) -> Self {
        match link_type {
            Linktype::NULL => Self::Null(link_type),
            Linktype::ETHERNET => Self::Ethernet(link_type),
            Linktype(12) => Self::RawIp(link_type),
            Linktype::LOOP => Self::Loop(link_type),
            Linktype::IPV4 => Self::IPv4(link_type),
            Linktype::IPV6 => Self::IPv6(link_type),
            _ => Self::Unsupported(link_type),
        }
    }
}
