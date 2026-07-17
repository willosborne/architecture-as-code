package org.finos.calm.store.util;

import com.mongodb.MongoWriteException;
import com.mongodb.ServerAddress;
import com.mongodb.WriteError;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.UpdateOptions;
import org.bson.BsonDocument;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TestMongoUpsertPushShould {

    private interface DocumentMongoCollection extends MongoCollection<Document> {
    }

    @Test
    void push_once_when_there_is_no_race() {
        MongoCollection<Document> collection = mock(DocumentMongoCollection.class);
        Bson filter = Filters.eq("namespace", "finos");
        Document entry = new Document("id", 1);

        MongoUpsertPush.pushWithDuplicateRetry(collection, filter, "architectures", entry);

        verify(collection, times(1)).updateOne(any(Bson.class), any(Bson.class), any(UpdateOptions.class));
    }

    @Test
    void retry_once_when_the_first_push_loses_a_create_race() {
        MongoCollection<Document> collection = mock(DocumentMongoCollection.class);
        Bson filter = Filters.eq("namespace", "finos");
        Document entry = new Document("id", 1);

        when(collection.updateOne(any(Bson.class), any(Bson.class), any(UpdateOptions.class)))
                .thenThrow(new MongoWriteException(
                        new WriteError(11000, "duplicate key", new BsonDocument()), new ServerAddress(), List.of()))
                .thenReturn(null);

        MongoUpsertPush.pushWithDuplicateRetry(collection, filter, "architectures", entry);

        verify(collection, times(2)).updateOne(any(Bson.class), any(Bson.class), any(UpdateOptions.class));
    }

    @Test
    void propagate_non_duplicate_key_write_errors() {
        MongoCollection<Document> collection = mock(DocumentMongoCollection.class);
        Bson filter = Filters.eq("namespace", "finos");
        Document entry = new Document("id", 1);

        MongoWriteException notADuplicateKeyError = new MongoWriteException(
                new WriteError(12, "some other error", new BsonDocument()), new ServerAddress(), List.of());
        when(collection.updateOne(any(Bson.class), any(Bson.class), any(UpdateOptions.class)))
                .thenThrow(notADuplicateKeyError);

        assertThrows(MongoWriteException.class,
                () -> MongoUpsertPush.pushWithDuplicateRetry(collection, filter, "architectures", entry));

        verify(collection, times(1)).updateOne(any(Bson.class), any(Bson.class), any(UpdateOptions.class));
    }
}
