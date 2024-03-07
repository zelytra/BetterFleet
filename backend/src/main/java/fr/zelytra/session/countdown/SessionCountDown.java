package fr.zelytra.session.countdown;

import java.time.LocalTime;

public class SessionCountDown {
    private LocalTime startingTimer;
    private LocalTime clickTime;

    public SessionCountDown() {

    }

    public SessionCountDown(LocalTime startingTimer) {
        this.startingTimer = startingTimer;
        calculateClickTime();
    }

    public void calculateClickTime() {
        this.clickTime = startingTimer.plusSeconds(6);
    }

    public LocalTime getStartingTimer() {
        return startingTimer;
    }

    public void setStartingTimer(LocalTime startingTimer) {
        this.startingTimer = startingTimer;
    }

    public LocalTime getClickTime() {
        return clickTime;
    }

    public void setClickTime(LocalTime clickTime) {
        this.clickTime = clickTime;
    }
}
