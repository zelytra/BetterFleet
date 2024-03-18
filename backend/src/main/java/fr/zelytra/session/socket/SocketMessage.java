package fr.zelytra.session.socket;

public record SocketMessage<T>(MessageType messageType, T data) {

    @Override
    public String toString() {
        return messageType().name() + " " + data.getClass();
    }
}
