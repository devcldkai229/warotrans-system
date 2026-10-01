using Microsoft.EntityFrameworkCore;

namespace WaroTrans.BuildingBlocks.Persistence;

public static class SnakeCaseNamingConvention
{
    public static void ApplySnakeCaseNamingConvention(this ModelBuilder modelBuilder)
    {
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            var tableName = entity.GetTableName();
            if (!string.IsNullOrEmpty(tableName))
            {
                entity.SetTableName(ToSnakeCase(tableName));
            }

            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
            }

            foreach (var key in entity.GetKeys())
            {
                var keyName = key.GetName();
                if (!string.IsNullOrEmpty(keyName))
                {
                    key.SetName(ToSnakeCase(keyName));
                }
            }

            foreach (var index in entity.GetIndexes())
            {
                var indexName = index.GetDatabaseName();
                if (!string.IsNullOrEmpty(indexName))
                {
                    index.SetDatabaseName(ToSnakeCase(indexName));
                }
            }

            foreach (var fk in entity.GetForeignKeys())
            {
                var fkName = fk.GetConstraintName();
                if (!string.IsNullOrEmpty(fkName))
                {
                    fk.SetConstraintName(ToSnakeCase(fkName));
                }
            }
        }
    }

    public static string ToSnakeCase(string input)
    {
        if (string.IsNullOrEmpty(input))
        {
            return input;
        }

        var chars = new List<char>(input.Length + 8);
        for (var i = 0; i < input.Length; i++)
        {
            var c = input[i];
            if (char.IsUpper(c))
            {
                if (i > 0)
                {
                    chars.Add('_');
                }

                chars.Add(char.ToLowerInvariant(c));
            }
            else
            {
                chars.Add(c);
            }
        }

        return new string(chars.ToArray());
    }
}
