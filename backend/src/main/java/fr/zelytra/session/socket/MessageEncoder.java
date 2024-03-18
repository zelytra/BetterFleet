package fr.zelytra.session.socket;

import com.google.gson.Gson;
import jakarta.websocket.Encoder;

public class MessageEncoder implements Encoder.Text<SocketMessage> {

    private static final Gson gson = new Gson();

    @Override
    public String encode(SocketMessage socketMessage) {
        return gson.toJson(socketMessage);
    }
}
