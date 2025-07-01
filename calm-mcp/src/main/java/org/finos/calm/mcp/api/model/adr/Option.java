package org.finos.calm.mcp.api.model.adr;

import java.util.List;
import java.util.Objects;

public final class Option {
    private String name;
    private String description;
    private List<String> positiveConsequences;
    private List<String> negativeConsequences;

    public Option() {

    }

    public Option(String name, String description, List<String> positiveConsequences, List<String> negativeConsequences) {
        setName(name);
        setDescription(description);
        setPositiveConsequences(positiveConsequences);
        setNegativeConsequences(negativeConsequences);
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public List<String> getPositiveConsequences() {
        return positiveConsequences;
    }

    public List<String> getNegativeConsequences() {
        return negativeConsequences;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setPositiveConsequences(List<String> positiveConsequences) {
        this.positiveConsequences = positiveConsequences;
    }

    public void setNegativeConsequences(List<String> negativeConsequences) {
        this.negativeConsequences = negativeConsequences;
    }

    @Override
    public boolean equals(Object obj) {
        if(obj == this) return true;
        if(obj == null || obj.getClass() != this.getClass()) return false;
        var that = (Option) obj;
        return Objects.equals(this.name, that.name) &&
                Objects.equals(this.description, that.description) &&
                Objects.equals(this.positiveConsequences, that.positiveConsequences) &&
                Objects.equals(this.negativeConsequences, that.negativeConsequences);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, description, positiveConsequences, negativeConsequences);
    }

}
