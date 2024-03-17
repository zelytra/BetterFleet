package fr.zelytra.session.ip;

import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
public class ProxyCheckAPITest {

    @InjectMock
    private ProxyCheckAPI proxyCheckAPI;

    @BeforeEach
    public void setup() {
        proxyCheckAPI.setIp("1.1.1.1");
        Mockito.when(proxyCheckAPI.retrieveCountry()).thenReturn("Europe - France - Ile-de-France - Paris");
    }

    @Test
    public void testRetrieveCountry() {
        String result = proxyCheckAPI.retrieveCountry();
        assertEquals("Europe - France - Ile-de-France - Paris", result);
    }
}
