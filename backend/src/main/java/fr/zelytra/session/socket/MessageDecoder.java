package fr.zelytra.session.socket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.websocket.Decoder;

public class MessageDecoder implements Decoder.Text<SocketMessage> {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public SocketMessage<?> decode(String s) {
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        // Deserialize the incoming message to SocketMessage<?>
        try {
            return objectMapper.readValue(s, new TypeReference<>() {
            });
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public boolean willDecode(String s) {
        return (s != null);
    }
}
