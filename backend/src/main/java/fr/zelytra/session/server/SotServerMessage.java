package fr.zelytra.session.server;

// The variable serverIpPort need to be in this format : "x.x.x.x:x"
public record SotServerMessage(int port,String ip) {
}
