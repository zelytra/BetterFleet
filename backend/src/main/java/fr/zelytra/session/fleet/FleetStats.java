package fr.zelytra.session.fleet;

public class FleetStats {


    private int tryAmount;
    private int successPrediction;

    public FleetStats(int tryAmount, int successPrediction) {
        this.tryAmount = tryAmount;
        this.successPrediction = successPrediction;
    }

    public int getTryAmount() {
        return tryAmount;
    }

    public void setTryAmount(int tryAmount) {
        this.tryAmount = tryAmount;
    }

    public int getSuccessPrediction() {
        return successPrediction;
    }

    public void setSuccessPrediction(int successPrediction) {
        this.successPrediction = successPrediction;
    }

    public void addTry() {
        this.tryAmount++;
    }
}

