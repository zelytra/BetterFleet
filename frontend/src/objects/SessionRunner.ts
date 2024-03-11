import {LocalTime} from "@js-joda/core";

export interface SessionRunner {
    startingTimer: LocalTime
    clickTime?: LocalTime
}