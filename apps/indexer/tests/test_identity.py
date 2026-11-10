from src.identity import extrinsic_event_key, system_event_key, block_identity, normalize_block_hash


def test_keys_include_chain_and_block_hash():
    x = extrinsic_event_key(
        100, 3, "Treasury", "spend", block_hash="0xABC", chain_id="polkadot"
    )
    e = system_event_key(
        100, 3, "Treasury", "Awarded", block_hash="0xABC", chain_id="polkadot"
    )
    assert x.startswith("polkadot/0xabc/100:x:3:")
    assert e.startswith("polkadot/0xabc/100:e:3:")
    assert x != e


def test_repeated_call_identical_keys():
    a = system_event_key(26863938, 61, "Referenda", "Submitted", block_hash="0xea69")
    b = system_event_key(26863938, 61, "Referenda", "Submitted", block_hash="0xea69")
    assert a == b


def test_different_hash_different_identity():
    a = system_event_key(100, 1, "Referenda", "Submitted", block_hash="0xaaa")
    b = system_event_key(100, 1, "Referenda", "Submitted", block_hash="0xbbb")
    assert a != b


def test_leaf_keys_preserve_multiple_calls():
    a = extrinsic_event_key(50, 1, "Treasury", "spend", block_hash="0x1", leaf_index=0)
    b = extrinsic_event_key(50, 1, "Treasury", "spend", block_hash="0x1", leaf_index=1)
    assert a != b


def test_block_identity():
    assert block_identity(10, "ABC") == {
        "chain_id": "polkadot",
        "block_number": 10,
        "block_hash": "0xabc",
    }
    assert normalize_block_hash("0xAbC") == "0xabc"
