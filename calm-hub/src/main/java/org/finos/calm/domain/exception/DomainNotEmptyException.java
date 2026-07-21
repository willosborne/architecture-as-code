package org.finos.calm.domain.exception;

/**
 * Thrown when a domain cannot be deleted because it still has controls associated
 * with it. Carries the raw domain name as a field rather than a formatted message —
 * the resource layer (see {@code CalmResourceErrorResponses.domainNotEmptyResponse})
 * is solely responsible for composing and sanitizing the user-facing message, so it
 * isn't duplicated here.
 */
public class DomainNotEmptyException extends Exception {
    private final String domain;

    /**
     * @param domain the domain that could not be deleted because it still has controls
     */
    public DomainNotEmptyException(String domain) {
        super("Domain not empty: " + domain);
        this.domain = domain;
    }

    public String getDomain() {
        return domain;
    }
}
