package org.finos.calm.domain.exception;

public class DomainNotEmptyException extends Exception {
    public DomainNotEmptyException(String message) {
        super(message);
    }
}
