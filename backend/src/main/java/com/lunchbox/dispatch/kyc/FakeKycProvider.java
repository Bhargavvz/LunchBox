package com.lunchbox.dispatch.kyc;

import com.lunchbox.dispatch.KycDocument.DocType;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/** Sandbox: document numbers starting with "FAIL" fail verification; everything else verifies on first poll. */
@Component
@ConditionalOnProperty(name = "lunchbox.integrations.idfy.mode", havingValue = "fake", matchIfMissing = true)
public class FakeKycProvider implements KycProvider {

    private final Map<String, Boolean> requests = new ConcurrentHashMap<>();

    @Override
    public boolean supports(DocType type) {
        return type == DocType.DRIVING_LICENSE || type == DocType.PAN || type == DocType.VEHICLE_RC;
    }

    @Override
    public String submit(DocType type, String documentNumber, LocalDate dateOfBirth, String referenceId) {
        String requestId = "fake-" + referenceId;
        requests.put(requestId, documentNumber == null || !documentNumber.toUpperCase().startsWith("FAIL"));
        return requestId;
    }

    @Override
    public Optional<Result> fetch(String requestId) {
        boolean ok = requests.getOrDefault(requestId, true);
        return Optional.of(new Result(ok, "{\"provider\":\"fake\",\"verified\":" + ok + "}"));
    }
}
