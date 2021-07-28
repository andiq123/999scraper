using API.Services;
using Core.DTOs;
using Infrastructure.IdentityEntities;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class BaseApiController : ControllerBase
    {
    
        public BaseApiController() { }

     
    }
}