package fr.zelytra.session.socket;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Round-trip coverage for the WebSocket {@link MessageEncoder} (Gson) and {@link MessageDecoder}
 * (Jackson), which are used by the client test harness but were never exercised directly. Ensures
 * the message type and payload survive an encode → decode cycle across the two JSON stacks.
 */
class MessageEncoderDecoderTest {

    @Test
    void encodeThenDecode_preservesMessageTypeAndData() {
        MessageEncoder encoder = new MessageEncoder();
        MessageDecoder decoder = new MessageDecoder();

        SocketMessage<String> original = new SocketMessage<>(MessageType.RUN_COUNTDOWN, "3");

        String json = encoder.encode(original);
        SocketMessage<?> decoded = decoder.decode(json);

        assertEquals(MessageType.RUN_COUNTDOWN, decoded.messageType());
        assertEquals("3", decoded.data());
    }

    @Test
    void willDecode_rejectsNullAndAcceptsText() {
        MessageDecoder decoder = new MessageDecoder();

        assertFalse(decoder.willDecode(null));
        assertTrue(decoder.willDecode("{}"));
    }
}
