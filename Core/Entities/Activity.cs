using System;

namespace Core.Entities
{
    public class Activity
    {
        public Guid Id { get; set; }
        public DateTime DateTime { get; set; }

        private string _description;
        public string Description
        {
            get => _description;
            set => _description = $"Has searched for {value}";
        }

    }
}