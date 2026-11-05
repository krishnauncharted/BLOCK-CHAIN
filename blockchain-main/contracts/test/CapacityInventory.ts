import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { pad, stringToHex } from "viem";

describe("MEDwayReservation capacity inventory", async function () {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [owner, requester, provider, relayer, thirdParty] = await viem.getWalletClients();
  const requesterId = pad(stringToHex("hospital-a"), { size: 32 });
  const providerId = pad(stringToHex("lab-c"), { size: 32 });
  const resourceType = pad(stringToHex("diagnostic_slot"), { size: 32 });

  async function deployWithInventory(totalCapacity = 12) {
    const medway = await viem.deployContract("MEDwayReservation");
    await medway.write.registerInstitution(
      [requesterId, "City Hospital A", 1, requester.account.address],
      { account: owner.account },
    );
    await medway.write.registerInstitution(
      [providerId, "Central Diagnostic Lab C", 2, provider.account.address],
      { account: owner.account },
    );
    await medway.write.setResourceInventory(
      [resourceType, totalCapacity, true],
      { account: provider.account },
    );
    return medway;
  }

  async function signCapacityLock(medway: Awaited<ReturnType<typeof deployWithInventory>>, quantity: number) {
    const nonce = await medway.read.nonces([requester.account.address]);
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 900n;
    const duration = 600n;
    const chainId = await publicClient.getChainId();
    const signature = await requester.signTypedData({
      domain: {
        name: "MEDwayReservation",
        version: "1",
        chainId,
        verifyingContract: medway.address,
      },
      types: {
        CapacityLockRequest: [
          { name: "requester", type: "address" },
          { name: "provider", type: "address" },
          { name: "resourceType", type: "bytes32" },
          { name: "quantity", type: "uint32" },
          { name: "duration", type: "uint64" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "CapacityLockRequest",
      message: {
        requester: requester.account.address,
        provider: provider.account.address,
        resourceType,
        quantity,
        duration,
        nonce,
        deadline,
      },
    });
    return { signature, deadline, duration };
  }

  it("stores provider inventory and calculates available capacity", async function () {
    const medway = await deployWithInventory(12);

    const inventory = await medway.read.getResourceInventory([
      provider.account.address,
      resourceType,
    ]);

    assert.equal(inventory[0], 12);
    assert.equal(inventory[1], 0);
    assert.equal(inventory[2], 0);
    assert.equal(inventory[4], true);
    assert.equal(
      await medway.read.getAvailableCapacity([provider.account.address, resourceType]),
      12,
    );
  });

  it("locks capacity, converts it to a reservation, then releases it on cancellation", async function () {
    const medway = await deployWithInventory(12);
    const { signature, deadline, duration } = await signCapacityLock(medway, 3);

    await viem.assertions.emit(
      medway.write.lockCapacityWithSig(
        [
          requester.account.address,
          provider.account.address,
          resourceType,
          3,
          duration,
          deadline,
          signature,
        ],
        { account: relayer.account },
      ),
      medway,
      "CapacityLocked",
    );

    const lockEvents = await publicClient.getContractEvents({
      address: medway.address,
      abi: medway.abi,
      eventName: "CapacityLocked",
      strict: true,
    });
    const lockId = lockEvents[0].args.lockId;
    assert.ok(lockId);
    assert.equal(
      await medway.read.getAvailableCapacity([provider.account.address, resourceType]),
      9,
    );

    const latestBlock = await publicClient.getBlock();
    const reservationTxHash = await medway.write.createReservationWithLock(
      [lockId, pad(stringToHex("request-terms"), { size: 32 }), latestBlock.timestamp + 3600n],
      { account: owner.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash: reservationTxHash });
    const reservationEvents = await publicClient.getContractEvents({
      address: medway.address,
      abi: medway.abi,
      eventName: "ReservationCreated",
      fromBlock: receipt.blockNumber,
      strict: true,
    });
    const createdReservationId = reservationEvents[0].args.reservationId;

    const convertedInventory = await medway.read.getResourceInventory([
      provider.account.address,
      resourceType,
    ]);
    assert.equal(convertedInventory[1], 0);
    assert.equal(convertedInventory[2], 3);
    assert.equal(
      await medway.read.getAvailableCapacity([provider.account.address, resourceType]),
      9,
    );

    await medway.write.cancelReservation([createdReservationId], { account: requester.account });
    const cancelledInventory = await medway.read.getResourceInventory([
      provider.account.address,
      resourceType,
    ]);
    assert.equal(cancelledInventory[2], 0);
    assert.equal(
      await medway.read.getAvailableCapacity([provider.account.address, resourceType]),
      12,
    );
  });

  it("rejects inventory changes from an unregistered provider", async function () {
    const medway = await deployWithInventory();

    await viem.assertions.revertWithCustomError(
      medway.write.setResourceInventory(
        [resourceType, 20, true],
        { account: thirdParty.account },
      ),
      medway,
      "UnauthorizedProvider",
    );
  });

  it("does not allow inventory to be lowered below held or committed capacity", async function () {
    const medway = await deployWithInventory(12);
    const { signature, deadline, duration } = await signCapacityLock(medway, 3);
    await medway.write.lockCapacityWithSig(
      [
        requester.account.address,
        provider.account.address,
        resourceType,
        3,
        duration,
        deadline,
        signature,
      ],
      { account: relayer.account },
    );

    await viem.assertions.revertWithCustomError(
      medway.write.setResourceInventory(
        [resourceType, 2, true],
        { account: provider.account },
      ),
      medway,
      "InsufficientCapacity",
    );
  });
});
