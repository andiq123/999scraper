using System.ComponentModel.DataAnnotations;

namespace Core.DTOs
{
    public class RegisterDto : LoginDto
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; }
    }
}