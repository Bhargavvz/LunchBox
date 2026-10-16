package com.lunchbox.addresses;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface AddressRepository extends JpaRepository<Address, UUID> {

    List<Address> findByParentIdAndDeletedAtIsNullOrderByCreatedAt(UUID parentId);

    List<Address> findByParentId(UUID parentId);

    Optional<Address> findByIdAndParentIdAndDeletedAtIsNull(UUID id, UUID parentId);

    List<Address> findByIdIn(Collection<UUID> ids);

    long countByParentIdAndDeletedAtIsNull(UUID parentId);
}
