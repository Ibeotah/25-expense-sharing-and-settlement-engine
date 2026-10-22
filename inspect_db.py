
# Its goal is to inspect and print out the design of your database.

# Instead of opening Supabase to check your tables, this script looks inside your database and prints a neat list of:

# Every column name, its data type (like text, number, etc.), and rules (whether it can be empty or has a default value).

# Every constraint (like primary keys and rules) attached to each table.


from sqlalchemy import text

from database import engine


TABLES = [
    "groups",
    "members",
    "group_memberships",
    "expenses",
    "expense_payments",
]


def inspect_database():
    with engine.connect() as connection:
        for table_name in TABLES:
            print(f"\n{'=' * 50}")
            print(f"TABLE: {table_name}")
            print("=" * 50)

            columns = connection.execute(
                text("""
                    SELECT
                        column_name,
                        data_type,
                        is_nullable,
                        column_default
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = :table_name
                    ORDER BY ordinal_position
                """),
                {"table_name": table_name},
            ).mappings().all()

            for column in columns:
                print(
                    f"Column: {column['column_name']} | "
                    f"Type: {column['data_type']} | "
                    f"Nullable: {column['is_nullable']} | "
                    f"Default: {column['column_default']}"
                )

            constraints = connection.execute(
                text("""
                    SELECT
                        constraint_name,
                        constraint_type
                    FROM information_schema.table_constraints
                    WHERE table_schema = 'public'
                      AND table_name = :table_name
                    ORDER BY constraint_type, constraint_name
                """),
                {"table_name": table_name},
            ).mappings().all()

            print("\nConstraints:")

            for constraint in constraints:
                print(
                    f"{constraint['constraint_name']} | "
                    f"{constraint['constraint_type']}"
                )


if __name__ == "__main__":
    inspect_database()
