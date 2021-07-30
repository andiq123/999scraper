using System;

namespace Core.DTOs
{
    public class UserDto
    {
        public string Id { get; set; }
        public string Email { get; set; }
        public string Username { get; set; }
        public string Token { get; set; }

        public bool IsOnline { get; set; }
        public DateTime LastActive { get; set; }
    }
}