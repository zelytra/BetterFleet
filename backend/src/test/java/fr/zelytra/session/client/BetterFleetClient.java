package fr.zelytra.session.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import fr.zelytra.session.socket.MessageDecoder;
import fr.zelytra.session.socket.MessageEncoder;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.SocketMessage;
import jakarta.websocket.*;

import java.io.IOException;
import java.util.concurrent.CountDownLatch;

@ClientEndpoint(decoders = MessageDecoder.class, encoders = MessageEncoder.class)
public class BetterFleetClient {

    private CountDownLatch latch = new CountDownLatch(1);
    private SocketMessage messageReceived;
    private Session session;

    @OnOpen
    void open(Session session) throws EncodeException, IOException {
        this.session = session;
    }


    @OnMessage
    void message(SocketMessage<?> msg) {
        messageReceived = msg;
        latch.countDown();
    }

    @OnClose
    void close() {
        latch.countDown();
    }

    public <T> void sendMessage(MessageType type, T data) throws EncodeException, IOException {
        SocketMessage<T> socketMessage = new SocketMessage<>(type, data);
        session.getBasicRemote().sendObject(socketMessage);
    }

    public <T> T getMessageReceived(Class<T> tClass) {
        return new ObjectMapper().convertValue(messageReceived.data(), tClass);
    }

    public Session getSession() {
        return session;
    }

    // Getter for latch
    public CountDownLatch getLatch() {
        return latch;
    }

    public void setLatch(CountDownLatch latch) {
        this.latch = latch;
    }
}