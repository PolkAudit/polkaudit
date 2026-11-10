"""Indexer event_key uniqueness, provenance columns, and contiguous cursor

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-11-10

Compatibility notes (DO NOT apply to production in P0-2B Stage A):
- Adds nullable event_key / provenance columns, backfills synthetic legacy keys,
  then enforces UNIQUE(event_key).
- If pre-existing logical duplicates exist beyond id-suffixed legacy keys, the
  unique index creation will fail — run the assessment queries in upgrade()
  comments / docs before applying.
- Creates indexer_cursor singleton; bootstraps from processed_blocks when present.
"""

from alembic import op
import sqlalchemy as sa


revision = "g7h8i9j0k1l2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Assessment (operator should run before apply on shared DBs) ---
    # SELECT block_number, beneficiary, value, COUNT(*) FROM treasury_spends
    #   GROUP BY 1,2,3 HAVING COUNT(*) > 1;
    # SELECT block_number, voter, proposal_index, vote, COUNT(*) FROM votes
    #   GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;

    op.add_column("extrinsics", sa.Column("extrinsic_index", sa.Integer(), nullable=True))
    op.add_column("extrinsics", sa.Column("event_key", sa.String(), nullable=True))

    op.add_column("proposals", sa.Column("event_key", sa.String(), nullable=True))
    op.add_column("proposals", sa.Column("extrinsic_index", sa.Integer(), nullable=True))
    op.add_column("proposals", sa.Column("event_index", sa.Integer(), nullable=True))
    op.add_column("proposals", sa.Column("source", sa.String(), nullable=True))

    op.add_column("votes", sa.Column("event_key", sa.String(), nullable=True))
    op.add_column("votes", sa.Column("extrinsic_index", sa.Integer(), nullable=True))
    op.add_column("votes", sa.Column("event_index", sa.Integer(), nullable=True))
    op.add_column("votes", sa.Column("source", sa.String(), nullable=True))

    op.add_column("treasury_spends", sa.Column("event_key", sa.String(), nullable=True))
    op.add_column("treasury_spends", sa.Column("extrinsic_index", sa.Integer(), nullable=True))
    op.add_column("treasury_spends", sa.Column("event_index", sa.Integer(), nullable=True))
    op.add_column("treasury_spends", sa.Column("source", sa.String(), nullable=True))

    # Synthetic legacy keys preserve existing rows without claiming true chain identity.
    op.execute("UPDATE extrinsics SET event_key = 'legacy:extrinsic:' || id::text WHERE event_key IS NULL")
    op.execute(
        "UPDATE extrinsics SET extrinsic_index = id WHERE extrinsic_index IS NULL"
    )
    op.execute("UPDATE proposals SET event_key = 'legacy:proposal:' || id::text WHERE event_key IS NULL")
    op.execute("UPDATE proposals SET source = 'legacy' WHERE source IS NULL")
    op.execute("UPDATE votes SET event_key = 'legacy:vote:' || id::text WHERE event_key IS NULL")
    op.execute("UPDATE votes SET source = 'legacy' WHERE source IS NULL")
    op.execute(
        "UPDATE treasury_spends SET event_key = 'legacy:treasury:' || id::text WHERE event_key IS NULL"
    )
    op.execute("UPDATE treasury_spends SET source = 'legacy' WHERE source IS NULL")

    op.create_index("ix_extrinsics_event_key", "extrinsics", ["event_key"], unique=False)
    op.create_index("ix_proposals_event_key", "proposals", ["event_key"], unique=False)
    op.create_index("ix_votes_event_key", "votes", ["event_key"], unique=False)
    op.create_index("ix_treasury_spends_event_key", "treasury_spends", ["event_key"], unique=False)

    op.create_unique_constraint("uq_extrinsics_event_key", "extrinsics", ["event_key"])
    op.create_unique_constraint(
        "uq_extrinsics_block_extrinsic_index", "extrinsics", ["block_number", "extrinsic_index"]
    )
    op.create_unique_constraint("uq_proposals_event_key", "proposals", ["event_key"])
    op.create_unique_constraint("uq_votes_event_key", "votes", ["event_key"])
    op.create_unique_constraint("uq_treasury_spends_event_key", "treasury_spends", ["event_key"])

    op.create_table(
        "indexer_cursor",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("range_start", sa.BigInteger(), nullable=False),
        sa.Column("contiguous_through", sa.BigInteger(), nullable=False),
        sa.Column("historical_gaps", sa.JSON(), nullable=True),
        sa.Column("coverage_complete", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.CheckConstraint("id = 1", name="ck_indexer_cursor_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Bootstrap cursor: only claim dense span; never set coverage_complete=1 from MAX alone.
    op.execute(
        """
        INSERT INTO indexer_cursor (id, range_start, contiguous_through, historical_gaps, coverage_complete)
        SELECT
          1,
          CASE
            WHEN cnt = (max_bn - min_bn + 1) THEN min_bn
            ELSE max_bn
          END,
          max_bn,
          CASE
            WHEN cnt = (max_bn - min_bn + 1) THEN
              CASE WHEN min_bn > 1 THEN
                json_build_array(json_build_object('start', 1, 'end', min_bn - 1, 'reason', 'below_verified_range'))
              ELSE '[]'::json END
            ELSE
              json_build_array(json_build_object('start', min_bn, 'end', max_bn - 1, 'reason', 'non_dense_processed_blocks'))
          END,
          0
        FROM (
          SELECT
            MIN(block_number) AS min_bn,
            MAX(block_number) AS max_bn,
            COUNT(*)::bigint AS cnt
          FROM processed_blocks
        ) s
        WHERE max_bn IS NOT NULL
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("indexer_cursor")

    op.drop_constraint("uq_treasury_spends_event_key", "treasury_spends", type_="unique")
    op.drop_constraint("uq_votes_event_key", "votes", type_="unique")
    op.drop_constraint("uq_proposals_event_key", "proposals", type_="unique")
    op.drop_constraint("uq_extrinsics_block_extrinsic_index", "extrinsics", type_="unique")
    op.drop_constraint("uq_extrinsics_event_key", "extrinsics", type_="unique")

    op.drop_index("ix_treasury_spends_event_key", table_name="treasury_spends")
    op.drop_index("ix_votes_event_key", table_name="votes")
    op.drop_index("ix_proposals_event_key", table_name="proposals")
    op.drop_index("ix_extrinsics_event_key", table_name="extrinsics")

    op.drop_column("treasury_spends", "source")
    op.drop_column("treasury_spends", "event_index")
    op.drop_column("treasury_spends", "extrinsic_index")
    op.drop_column("treasury_spends", "event_key")

    op.drop_column("votes", "source")
    op.drop_column("votes", "event_index")
    op.drop_column("votes", "extrinsic_index")
    op.drop_column("votes", "event_key")

    op.drop_column("proposals", "source")
    op.drop_column("proposals", "event_index")
    op.drop_column("proposals", "extrinsic_index")
    op.drop_column("proposals", "event_key")

    op.drop_column("extrinsics", "event_key")
    op.drop_column("extrinsics", "extrinsic_index")
