// mainly from https://github.com/GyulyVGC/sniffnet

use std::sync::{Arc, Mutex};
use std::net::IpAddr;
use etherparse::{Ethernet2Header, LaxPacketHeaders, LenSource, NetHeaders, TransportHeader};
use etherparse::err::ip::{HeaderError, LaxHeaderSliceError};
use etherparse::err::{Layer, LenError};
use pcap::{Active, Capture, Device, Packet};
use crate::network::my_link_type::MyLinkType;
use crate::network::address_port_pair::AddressPortPair;
use crate::network::packet_filters_fields::PacketFiltersFields;

pub struct NetworkTools;

fn analyze_transport_header(
    transport_header: Option<TransportHeader>,
    port1: &mut Option<u16>,
    port2: &mut Option<u16>,
    protocol: &mut Protocol
) -> bool {
    match transport_header {
        Some(TransportHeader::Udp(udp_header)) => {
            *port1 = Some(udp_header.source_port);
            *port2 = Some(udp_header.destination_port);
            *protocol = Protocol::UDP;
            true
        }
        Some(TransportHeader::Tcp(tcp_header)) => {
            *port1 = Some(tcp_header.source_port);
            *port2 = Some(tcp_header.destination_port);
            *protocol = Protocol::TCP;
            true
        }
        Some(TransportHeader::Icmpv4(_icmpv4_header)) => {
            *port1 = None;
            *port2 = None;
            *protocol = Protocol::ICMP;
            true
        }
        Some(TransportHeader::Icmpv6(_icmpv6_header)) => {
            *port1 = None;
            *port2 = None;
            *protocol = Protocol::ICMP;
            true
        }
        _ => false,
    }
}

/// Converts a MAC address in its hexadecimal form
fn analyze_link_header(
    link_header: Option<Ethernet2Header>,
    mac_address1: &mut Option<String>,
    mac_address2: &mut Option<String>,
    exchanged_bytes: &mut u128,
) {
    if let Some(header) = link_header {
        *exchanged_bytes += 14;
        *mac_address1 = Some(mac_from_dec_to_hex(header.source));
        *mac_address2 = Some(mac_from_dec_to_hex(header.destination));
    } else {
        *mac_address1 = None;
        *mac_address2 = None;
    }
}

fn mac_from_dec_to_hex(mac_dec: [u8; 6]) -> String {
    let mut mac_hex = String::new();
    for n in &mac_dec {
        mac_hex.push_str(&format!("{n:02x}:"));
    }
    mac_hex.pop();
    mac_hex
}

pub fn analyze_headers(
    headers: LaxPacketHeaders,
    mac_addresses: &mut (Option<String>, Option<String>),
    exchanged_bytes: &mut u128,
    packet_filters_fields: &mut PacketFiltersFields,
) -> Option<AddressPortPair> {
    analyze_link_header(
        headers.link,
        &mut mac_addresses.0,
        &mut mac_addresses.1,
        exchanged_bytes,
    );

    if !analyze_network_header(
        headers.net,
        exchanged_bytes,
        &mut packet_filters_fields.ip_version,
        &mut packet_filters_fields.source,
        &mut packet_filters_fields.dest,
    ) {
        return None;
    }

    if !analyze_transport_header(
        headers.transport,
        &mut packet_filters_fields.sport,
        &mut packet_filters_fields.dport,
        &mut packet_filters_fields.protocol
    ) {
        return None;
    }

    Some(AddressPortPair::new(
        packet_filters_fields.source.to_string(),
        packet_filters_fields.sport,
        packet_filters_fields.dest.to_string(),
        packet_filters_fields.dport
    ))
}

/// Determines if the capture opening resolves into an Error
pub fn get_capture_result(device: Device) -> (Option<String>, Option<Capture<Active>>) {
    let cap_result = Capture::from_device(device)
        .expect("Capture initialization error\n\r")
        .promisc(true)
        .snaplen(256) //limit stored packets slice dimension (to keep more in the buffer)
        .immediate_mode(true) //parse packets ASAP!
        .open();
    if cap_result.is_err() {
        let err_string = cap_result.err().unwrap().to_string();
        (Some(err_string), None)
    } else {
        (None, cap_result.ok())
    }
}

pub fn parse_packets(
    current_capture_id: &Arc<Mutex<usize>>,
    mut cap: Capture<Active>
) {
    let capture_id = *current_capture_id.lock().unwrap();

    let my_link_type = MyLinkType::from_pcap_link_type(cap.get_datalink());

    loop {
        match cap.next_packet() {
            Err(_) => {
                if *current_capture_id.lock().unwrap() != capture_id {
                    return;
                }
                continue;
            }
            Ok(packet) => {
                if *current_capture_id.lock().unwrap() != capture_id {
                    return;
                }
                if let Ok(headers) = get_sniffable_headers(&packet, my_link_type) {
                    let mut exchanged_bytes = 0;
                    let mut mac_addresses = (None, None);
                    let mut packet_filters_fields = PacketFiltersFields::default();

                    let key_option = analyze_headers(
                        headers,
                        &mut mac_addresses,
                        &mut exchanged_bytes,
                        &mut packet_filters_fields
                    );
                    if key_option.is_none() {
                        continue;
                    }

                    let key = key_option.unwrap();
                    println!("Key: {:?}", key);
                }
            }
        }
    }
}

fn analyze_network_header(
    network_header: Option<NetHeaders>,
    exchanged_bytes: &mut u128,
    network_protocol: &mut IpVersion,
    address1: &mut IpAddr,
    address2: &mut IpAddr,
) -> bool {
    match network_header {
        Some(NetHeaders::Ipv4(ipv4header, _)) => {
            *network_protocol = IpVersion::IPv4;
            *address1 = IpAddr::from(ipv4header.source);
            *address2 = IpAddr::from(ipv4header.destination);
            *exchanged_bytes += u128::from(ipv4header.total_len);
            true
        }
        Some(NetHeaders::Ipv6(ipv6header, _)) => {
            *network_protocol = IpVersion::IPv6;
            *address1 = IpAddr::from(ipv6header.source);
            *address2 = IpAddr::from(ipv6header.destination);
            *exchanged_bytes += u128::from(40 + ipv6header.payload_length);
            true
        }
        _ => false,
    }
}

pub enum IpVersion {
    IPv4,
    IPv6,
}

impl IpVersion {
    pub(crate) const ALL: [IpVersion; 2] = [IpVersion::IPv4, IpVersion::IPv6];
}


#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[allow(clippy::upper_case_acronyms)]
pub enum Protocol {
    TCP,
    UDP,
    ICMP,
}
impl Protocol {
    pub const ALL: [Protocol; 3] = [Protocol::TCP, Protocol::UDP, Protocol::ICMP];
}

fn get_sniffable_headers<'a>(
    packet: &'a Packet,
    my_link_type: MyLinkType,
) -> Result<LaxPacketHeaders<'a>, LaxHeaderSliceError> {
    match my_link_type {
        MyLinkType::Ethernet(_) | MyLinkType::Unsupported(_) | MyLinkType::NotYetAssigned => {
            LaxPacketHeaders::from_ethernet(packet).map_err(LaxHeaderSliceError::Len)
        }
        MyLinkType::RawIp(_) | MyLinkType::IPv4(_) | MyLinkType::IPv6(_) => {
            LaxPacketHeaders::from_ip(packet)
        }
        MyLinkType::Null(_) | MyLinkType::Loop(_) => from_null(packet),
    }
}

fn from_null(packet: &[u8]) -> Result<LaxPacketHeaders, LaxHeaderSliceError> {
    if packet.len() <= 4 {
        return Err(LaxHeaderSliceError::Len(LenError {
            required_len: 4,
            len: packet.len(),
            len_source: LenSource::Slice,
            layer: Layer::Ethernet2Header,
            layer_start_offset: 0,
        }));
    }

    let is_valid_af_inet = {
        // based on https://wiki.wireshark.org/NullLoopback.md (2023-12-31)
        fn matches(value: u32) -> bool {
            match value {
                // 2 = IPv4 on all platforms
                // 24, 28, or 30 = IPv6 depending on platform
                2 | 24 | 28 | 30 => true,
                _ => false,
            }
        }
        let h = &packet[..4];
        let b = [h[0], h[1], h[2], h[3]];
        // check both big endian and little endian representations
        // as some OS'es use native endianess and others use big endian
        matches(u32::from_le_bytes(b)) || matches(u32::from_be_bytes(b))
    };

    if is_valid_af_inet {
        LaxPacketHeaders::from_ip(&packet[4..])
    } else {
        Err(LaxHeaderSliceError::Content(
            HeaderError::UnsupportedIpVersion { version_number: 0 },
        ))
    }
}