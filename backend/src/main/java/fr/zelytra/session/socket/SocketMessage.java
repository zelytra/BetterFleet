package fr.zelytra.session.socket;

public record SocketMessage<T>(MessageType messageType, T data){}
